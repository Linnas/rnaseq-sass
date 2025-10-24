# plumber.R
suppressPackageStartupMessages({
  library(plumber)
  library(jsonlite)
  library(readr)
  library(dplyr)
  library(tidyr)
  library(stringr)
  library(fs)
  library(mime)
  library(DBI)
  library(fs)
  library(RSQLite)
  library(callr)
  library(DESeq2)
  library(tibble)
  library(digest)
  library(clusterProfiler)
  library(AnnotationDbi)
})

DATA_DIR <- Sys.getenv("DATA_DIR", unset = "data")
dir_create(DATA_DIR)

# --- sqlite for jobs ---
db_path <- file.path(DATA_DIR, "jobs.sqlite")
con <- dbConnect(RSQLite::SQLite(), db_path)
dbExecute(con, "PRAGMA journal_mode=WAL;") 
dbExecute(con, "CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT,
  message TEXT,
  created_at TEXT,
  updated_at TEXT,
  workdir TEXT,
  design_col TEXT
)")

launch_job <- function(id, workdir, design_col, db_path) {
  log_path <- file.path(workdir, "job.log")

  # ---- Try background first ----
  bg <- try(callr::r_bg(
    function(id, workdir, design_col, db_path, log_path) {
      # Child process body (self-contained)
      suppressPackageStartupMessages({
        library(DESeq2); library(readr); library(dplyr); library(DBI); library(RSQLite); library(fs); library(tibble)
      })

      con2 <- DBI::dbConnect(RSQLite::SQLite(), db_path)
      on.exit(try(DBI::dbDisconnect(con2), silent = TRUE), add = TRUE)

      upd <- function(status, message=NULL) {
        now <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
        DBI::dbExecute(con2, "UPDATE jobs SET status=?, message=?, updated_at=? WHERE id=?",
                       params = list(status, message, now, id))
      }

      tryCatch({
        upd("running","DESeq2 starting")

        counts <- readr::read_csv(file.path(workdir, "counts.csv"), show_col_types = FALSE)
        meta   <- readr::read_csv(file.path(workdir, "metadata.csv"), show_col_types = FALSE)

        if (!("gene" %in% names(counts))) names(counts)[1] <- "gene"
        rownames_mat <- counts$gene
        count_mat <- counts |> dplyr::select(-gene)
        count_mat[] <- lapply(count_mat, function(v) as.integer(round(v)))
        count_mat <- as.matrix(data.frame(count_mat, check.names = FALSE))

        if (!("sample" %in% names(meta))) names(meta)[1] <- "sample"
        rownames(meta) <- meta$sample

        keep <- intersect(colnames(count_mat), rownames(meta))
        count_mat <- count_mat[, keep, drop=FALSE]
        meta <- meta[keep, , drop=FALSE]

        if (!(design_col %in% colnames(meta))) stop(paste("design_col not in metadata:", design_col))
        meta[[design_col]] <- factor(meta[[design_col]])

        dds <- DESeq2::DESeqDataSetFromMatrix(countData = count_mat, colData = meta, design = as.formula(paste("~", design_col)))
        dds <- dds[rowSums(counts(dds)) > 5, ]
        rownames(dds) <- rownames_mat[match(rownames(dds), rownames_mat, nomatch=0)]
        dds <- DESeq2::DESeq(dds, quiet = TRUE)

        saveRDS(dds, file.path(workdir, "dds.rds"))
        readr::write_csv(meta, file.path(workdir, "samples_used.csv"))
        upd("completed","Ready for parameterized results")
      }, error = function(e) {
        msg <- paste("Error:", conditionMessage(e))
        try(write(msg, file=log_path, append=TRUE), silent=TRUE)
        upd("failed", msg)
      })
    },
    args   = list(id=id, workdir=workdir, design_col=design_col, db_path=db_path, log_path=log_path),
    stdout = log_path,   # capture child stdout
    stderr = log_path    # capture child stderr
  ), silent = TRUE)

  if (!inherits(bg, "try-error")) {
    return(TRUE)  # background started OK
  }

  FALSE
}


touch_job <- function(id, status, message = NULL, workdir = NULL, design_col = NULL) {
  now <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
  exists <- dbGetQuery(con, "SELECT id FROM jobs WHERE id = ?", params = list(id))
  if (nrow(exists) == 0) {
    dbExecute(con, "INSERT INTO jobs (id,status,message,created_at,updated_at,workdir,design_col)
                    VALUES (?,?,?,?,?,?,?)",
              params = list(id, status, message, now, now, workdir, design_col))
  } else {
    dbExecute(con, "UPDATE jobs SET status=?, message=?, updated_at=?, workdir=?, design_col=? WHERE id=?",
              params = list(status, message, now, workdir, design_col, id))
  }
}
get_job <- function(id) {
  out <- dbGetQuery(con, "SELECT * FROM jobs WHERE id = ?", params = list(id))
  if (nrow(out) == 0) return(NULL)
  out[1,]
}

# --- helpers ---
safe_uuid <- function() paste0(format(Sys.time(), "%Y%m%d%H%M%S"), "-", paste0(sample(c(letters,0:9), 8, TRUE), collapse=""))

prepare_outputs <- function(dds, contrast, padj_cutoff, lfc_thresh, top_n, item_limit) {
  res <- results(dds, contrast = contrast)
  res_df <- as.data.frame(res) |> tibble::rownames_to_column("gene")
  res_df <- res_df |> mutate(padj = ifelse(is.na(padj), 1, padj))

  volc <- res_df |>
    transmute(
      gene,
      log2FC = log2FoldChange,
      padj = padj,
      neglog10padj = -log10(padj + 1e-300),
      sig = !is.na(padj) & padj <= padj_cutoff & abs(log2FoldChange) >= lfc_thresh
    ) |>
    arrange(desc(sig), desc(abs(log2FC))) |>
    head(item_limit)

  top_tbl <- res_df |>
    arrange(padj, desc(abs(log2FoldChange))) |>
    head(top_n)

  vsd <- varianceStabilizingTransformation(dds, blind = TRUE)
  mat <- assay(vsd)
  pc <- prcomp(t(mat), center = TRUE, scale. = FALSE)
  grp_col <- colnames(colData(dds))[1]
  pca_df <- data.frame(
    sample = rownames(pc$x),
    PC1 = pc$x[,1],
    PC2 = pc$x[,2],
    group = colData(dds)[rownames(pc$x), grp_col, drop=TRUE]
  )

  list(volcano = volc, top_table = top_tbl, pca = pca_df)
}

# -------- Enrichment helpers & cache --------
cache_dir_for <- function(job) { cd <- file.path(job$workdir, "cache_enrich"); dir_create(cd); cd }
cache_key <- function(tag, params_list) digest::digest(list(tag=tag, params=params_list), algo="xxhash64")
cache_get <- function(job, key) { path <- file.path(cache_dir_for(job), paste0(key, ".rds")); if (file_exists(path)) readRDS(path) else NULL }
cache_put <- function(job, key, obj) { path <- file.path(cache_dir_for(job), paste0(key, ".rds")); saveRDS(obj, path) }

detect_keytype <- function(ids) {
  ids <- unique(na.omit(ids))
  if (length(ids) == 0) return("SYMBOL")
  if (all(grepl("^ENSG\\d+", ids))) return("ENSEMBL")
  if (all(grepl("^[0-9]+$", ids))) return("ENTREZID")
  "SYMBOL"
}
map_ids <- function(ids, fromType, toType, OrgDb) {
  ids <- unique(na.omit(ids))
  if (length(ids) == 0) return(data.frame())
  suppressWarnings(clusterProfiler::bitr(ids, fromType = fromType, toType = toType, OrgDb = OrgDb))
}
gene_universe_from_dds <- function(dds, fromType, OrgDb) {
  all_ids <- rownames(dds)
  inferred <- if (fromType == "auto") detect_keytype(all_ids) else fromType
  uni <- map_ids(all_ids, inferred, "ENTREZID", OrgDb)
  unique(uni$ENTREZID)
}
de_gene_lists <- function(dds, contrast, padj_cutoff, lfc_thresh, fromType="auto", OrgDb) {
  res <- as.data.frame(results(dds, contrast = contrast))
  res$padj[is.na(res$padj)] <- 1
  res$log2FoldChange[is.na(res$log2FoldChange)] <- 0
  res$gene <- rownames(res)
  inferred <- if (fromType == "auto") detect_keytype(res$gene) else fromType
  conv <- map_ids(res$gene, inferred, "ENTREZID", OrgDb)
  res2 <- merge(res, conv, by.x="gene", by.y=inferred, all.x=FALSE)
  res2 <- res2[!is.na(res2$ENTREZID), ]
  ora_ids <- unique(subset(res2, padj <= padj_cutoff & abs(log2FoldChange) >= lfc_thresh)$ENTREZID)
  gl <- res2$log2FoldChange; names(gl) <- res2$ENTREZID; gl <- sort(gl, decreasing=TRUE)
  list(ora = ora_ids, gsea = gl, inferred_keytype = inferred)
}
fmt_enrich_df_for_plots <- function(df, top=20) {
  if (is.null(df) || nrow(df) == 0) return(list(items=list()))
  df$neglog10padj <- -log10(pmax(df$p.adjust %||% df$pvalue, .Machine$double.eps))
  if ("GeneRatio" %in% names(df)) {
    parts <- strsplit(df$GeneRatio, "/")
    df$gene_ratio <- sapply(parts, function(p) as.numeric(p[1]) / as.numeric(p[2]))
  } else {
    df$gene_ratio <- if ("Count" %in% names(df) && "setSize" %in% names(df)) df$Count / pmax(df$setSize, df$Count) else df$Count
  }
  df <- df[order(df$p.adjust %||% df$pvalue, -df$Count %||% 0), ]
  df <- head(df, top)
  items <- lapply(seq_len(nrow(df)), function(i) {
    list(
      term = as.character(df$ID[i] %||% df$Description[i]),
      description = as.character(df$Description[i]),
      count = as.integer(df$Count[i] %||% 0),
      gene_ratio = unname(as.numeric(df$gene_ratio[i] %||% 0)),
      p_adjust = unname(as.numeric(df$p.adjust[i] %||% df$pvalue[i] %||% NA)),
      neglog10padj = unname(as.numeric(df$neglog10padj[i] %||% 0))
    )
  })
  list(items = items)
}
`%||%` <- function(a,b) if (!is.null(a)) a else b

# ------------- CORS -------------
#* @filter cors
function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req$REQUEST_METHOD == "OPTIONS") { res$status <- 200; return(list()) }
  plumber::forward()
}

# ------------- Create job -------------
#* Create a new analysis job (multipart/form-data)
#* @post /jobs
function(req, res){
  # Prefer explicit multipart parse; fall back to req$files for older setups
  mp <- tryCatch(mime::parse_multipart(req), error = function(e) NULL)

  get_dp <- function(name) {
    # Try parsed multipart
    if (!is.null(mp) && !is.null(mp[[name]]) && !is.null(mp[[name]]$datapath))
      return(mp[[name]]$datapath)
    # Fall back to req$files
    if (!is.null(req$files) && !is.null(req$files[[name]]) && !is.null(req$files[[name]]$datapath))
      return(req$files[[name]]$datapath)
    NULL
  }

  counts_dp   <- get_dp("counts")
  metadata_dp <- get_dp("metadata")

  if (is.null(counts_dp) || is.null(metadata_dp)) {
    res$status <- 400
    return(list(error = c("Both 'counts' and 'metadata' files are required.")))
  }

  id <- safe_uuid()
  workdir <- file.path(DATA_DIR, id)
  dir_create(workdir)

  file.copy(counts_dp,   file.path(workdir, "counts.csv"))
  file.copy(metadata_dp, file.path(workdir, "metadata.csv"))

  # allow design_col from multipart text if user posted it there
  if (!is.null(mp) && !is.null(mp$design_col)) {
    design_col <- mp$design_col
  }

  touch_job(id, "queued", "Job created", workdir = workdir, design_col = design_col)

  tryCatch({rx <- r_bg(function(args){
    library(DESeq2); library(readr); library(dplyr); library(DBI); library(RSQLite); library(fs); library(tibble)
    id <- args$id; workdir <- args$workdir; design_col <- args$design_col; db_path <- args$db_path
    con <- DBI::dbConnect(RSQLite::SQLite(), db_path)
    upd <- function(status, message=NULL) {
      now <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
      DBI::dbExecute(con, "UPDATE jobs SET status=?, message=?, updated_at=? WHERE id=?",
                     params = list(status, message, now, id))
    }
    upd("running","DESeq2 starting in child process")

    counts <- readr::read_csv(file.path(workdir, "counts.csv"), show_col_types = FALSE)
    meta   <- readr::read_csv(file.path(workdir, "metadata.csv"), show_col_types = FALSE)

    if (!("gene" %in% names(counts))) names(counts)[1] <- "gene"
    rownames_mat <- counts$gene
    count_mat <- counts |> select(-gene)
    count_mat[] <- lapply(count_mat, function(v) as.integer(round(v)))
    count_mat <- as.matrix(data.frame(count_mat, check.names = FALSE))

    if (!("sample" %in% names(meta))) names(meta)[1] <- "sample"
    rownames(meta) <- meta$sample

    keep <- intersect(colnames(count_mat), rownames(meta))
    count_mat <- count_mat[, keep, drop=FALSE]
    meta <- meta[keep, , drop=FALSE]

    if (!(design_col %in% colnames(meta))) stop(paste("design_col not in metadata:", design_col))
    meta[[design_col]] <- factor(meta[[design_col]])

    dds <- DESeqDataSetFromMatrix(countData = count_mat, colData = meta, design = as.formula(paste("~", design_col)))
    dds <- dds[rowSums(counts(dds)) > 5, ]
    rownames(dds) <- rownames_mat[match(rownames(dds), rownames_mat, nomatch=0)]
    dds <- DESeq(dds, quiet = TRUE)

    saveRDS(dds, file.path(workdir, "dds.rds"))
    readr::write_csv(meta, file.path(workdir, "samples_used.csv"))
    upd("completed","Ready for parameterized results")
    DBI::dbDisconnect(con)
  }, args = list(id=id, workdir=workdir, design_col=design_col, db_path=db_path))
}, error = function(e) {
  print(e)
  upd("failed", paste("Error:", conditionMessage(e)))
  list(job_id = id, status = "failed")
})

}

# ------------- Status -------------
#* @get /jobs/<id>/status
function(id){
  job <- get_job(id)
  if (is.null(job)) return(list(error="Not found"))
  list(job_id=job$id, status=job$status, message=job$message, design_col=job$design_col)
}

# ------------- Results -------------
#* @param padj_cutoff
#* @param lfc_thresh
#* @param top_n
#* @param item_limit
#* @param a
#* @param b
#* @get /jobs/<id>/results
function(res, id, padj_cutoff=0.05, lfc_thresh=1, top_n=100, item_limit=10000, a=NULL, b=NULL){
  job <- get_job(id)
  if (is.null(job) || job$status != "completed") { res$status <- 409; return(list(error="Job not completed")) }
  dds <- readRDS(file.path(job$workdir, "dds.rds"))
  design_col <- job$design_col
  if (is.null(a) || is.null(b)) {
    levs <- levels(colData(dds)[[design_col]]); if (length(levs) < 2) { res$status <- 400; return(list(error="Not enough levels for contrast")) }
    a <- levs[1]; b <- levs[2]
  }
  out <- prepare_outputs(dds, c(design_col, a, b),
                         as.numeric(padj_cutoff), as.numeric(lfc_thresh),
                         as.integer(top_n), as.integer(item_limit))
  list(job_id = id,
       params = list(padj_cutoff=as.numeric(padj_cutoff), lfc_thresh=as.numeric(lfc_thresh), top_n=as.integer(top_n), a=a, b=b),
       volcano = out$volcano, pca = out$pca, top_table = out$top_table)
}

# ------------- DE CSV download -------------
#* @get /jobs/<id>/download
function(res, id, padj_cutoff=0.05, lfc_thresh=1, a=NULL, b=NULL){
  job <- get_job(id)
  if (is.null(job) || job$status != "completed") { res$status <- 409; return(list(error="Job not completed")) }
  dds <- readRDS(file.path(job$workdir, "dds.rds"))
  design_col <- job$design_col
  if (is.null(a) || is.null(b)) { levs <- levels(colData(dds)[[design_col]]); a <- levs[1]; b <- levs[2] }
  res_df <- as.data.frame(results(dds, contrast = c(design_col, a, b)))
  res_df <- tibble::rownames_to_column(res_df, "gene")
  res_df$padj[is.na(res_df$padj)] <- 1
  res_df <- res_df |> mutate(sig = padj <= as.numeric(padj_cutoff) & abs(log2FoldChange) >= as.numeric(lfc_thresh))
  tmp <- tempfile(fileext = ".csv")
  readr::write_csv(res_df, tmp)
  res$setHeader("Content-Type", "text/csv")
  res$setHeader("Content-Disposition", sprintf('attachment; filename="deseq2_%s_vs_%s.csv"', a, b))
  include_file(tmp)
}

# ------------- GO enrichment -------------
#* @get /jobs/<id>/enrich/go
function(res, id,
         mode="ora", ont="BP",
         org_db="org.Hs.eg.db", keytype="auto",
         padj_cutoff=0.05, lfc_thresh=1,
         p_cutoff=0.05, q_cutoff=0.2,
         minGSSize=10, maxGSSize=500,
         top=20, a=NULL, b=NULL) {

  job <- get_job(id)
  if (is.null(job) || job$status != "completed") { res$status <- 409; return(list(error="Job not completed")) }
  dds <- readRDS(file.path(job$workdir, "dds.rds"))
  design_col <- job$design_col
  if (is.null(a) || is.null(b)) { levs <- levels(colData(dds)[[design_col]]); if (length(levs) < 2) { res$status <- 400; return(list(error="Not enough levels")) }; a <- levs[1]; b <- levs[2] }

  params <- list(mode=mode, ont=ont, org_db=org_db, keytype=keytype, a=a, b=b,
                 padj_cutoff=as.numeric(padj_cutoff), lfc_thresh=as.numeric(lfc_thresh),
                 p_cutoff=as.numeric(p_cutoff), q_cutoff=as.numeric(q_cutoff),
                 minGSSize=as.integer(minGSSize), maxGSSize=as.integer(maxGSSize))
  key <- cache_key("GO", params)
  df <- cache_get(job, key)
  if (is.null(df)) {
    OrgDb <- get(org_db, envir = asNamespace(org_db))
    gl <- de_gene_lists(dds, c(design_col, a, b),
                        padj_cutoff=params$padj_cutoff, lfc_thresh=params$lfc_thresh,
                        fromType=keytype, OrgDb=OrgDb)
    if (mode == "ora") {
      eg <- gl$ora; if (length(eg)==0) return(list(items=list(), warning="No DE genes passed the threshold"))
      uni <- gene_universe_from_dds(dds, gl$inferred_keytype, OrgDb)
      df <- suppressMessages(as.data.frame(clusterProfiler::enrichGO(
        gene=eg, OrgDb=OrgDb, keyType="ENTREZID", ont=ont, pAdjustMethod="BH",
        pvalueCutoff=params$p_cutoff, qvalueCutoff=params$q_cutoff,
        universe=uni, minGSSize=params$minGSSize, maxGSSize=params$maxGSSize, readable=TRUE
      )))
    } else {
      glist <- gl$gsea; if (length(glist)<10) return(list(items=list(), warning="Not enough genes for GSEA"))
      df <- suppressMessages(as.data.frame(clusterProfiler::gseGO(
        geneList=glist, OrgDb=OrgDb, keyType="ENTREZID", ont=ont,
        minGSSize=params$minGSSize, maxGSSize=params$maxGSSize, pvalueCutoff=params$p_cutoff
      )))
      if (!"Count" %in% names(df)) df$Count <- pmax(1, round(df$setSize*0.1))
    }
    cache_put(job, key, df)
  }
  fmt_enrich_df_for_plots(df, top=as.integer(top))
}

# ------------- KEGG enrichment -------------
#* @get /jobs/<id>/enrich/kegg
function(res, id,
         mode="ora", kegg_org="hsa", keytype="auto",
         padj_cutoff=0.05, lfc_thresh=1,
         p_cutoff=0.05, q_cutoff=0.2,
         minGSSize=10, maxGSSize=500,
         top=20, a=NULL, b=NULL) {

  job <- get_job(id)
  if (is.null(job) || job$status != "completed") { res$status <- 409; return(list(error="Job not completed")) }
  dds <- readRDS(file.path(job$workdir, "dds.rds"))
  design_col <- job$design_col
  if (is.null(a) || is.null(b)) { levs <- levels(colData(dds)[[design_col]]); if (length(levs) < 2) { res$status <- 400; return(list(error="Not enough levels")) }; a <- levs[1]; b <- levs[2] }

  params <- list(mode=mode, kegg_org=kegg_org, keytype=keytype, a=a, b=b,
                 padj_cutoff=as.numeric(padj_cutoff), lfc_thresh=as.numeric(lfc_thresh),
                 p_cutoff=as.numeric(p_cutoff), q_cutoff=as.numeric(q_cutoff),
                 minGSSize=as.integer(minGSSize), maxGSSize=as.integer(maxGSSize))
  key <- cache_key("KEGG", params)
  df <- cache_get(job, key)
  if (is.null(df)) {
    org_db <- if (kegg_org %in% c("hsa")) "org.Hs.eg.db" else if (kegg_org %in% c("mmu")) "org.Mm.eg.db" else "org.Hs.eg.db"
    OrgDb <- get(org_db, envir = asNamespace(org_db))
    gl <- de_gene_lists(dds, c(design_col, a, b),
                        padj_cutoff=params$padj_cutoff, lfc_thresh=params$lfc_thresh,
                        fromType=keytype, OrgDb=OrgDb)
    if (mode == "ora") {
      eg <- gl$ora; if (length(eg)==0) return(list(items=list(), warning="No DE genes passed the threshold"))
      df <- suppressMessages(as.data.frame(clusterProfiler::enrichKEGG(
        gene=eg, organism=kegg_org, pvalueCutoff=params$p_cutoff, qvalueCutoff=params$q_cutoff
      )))
    } else {
      glist <- gl$gsea; if (length(glist)<10) return(list(items=list(), warning="Not enough genes for GSEA"))
      df <- suppressMessages(as.data.frame(clusterProfiler::gseKEGG(
        geneList=glist, organism=kegg_org, minGSSize=params$minGSSize,
        maxGSSize=params$maxGSSize, pvalueCutoff=params$p_cutoff
      )))
      if (!"Count" %in% names(df)) df$Count <- pmax(1, round(df$setSize*0.1))
    }
    cache_put(job, key, df)
  }
  fmt_enrich_df_for_plots(df, top=as.integer(top))
}

# ------------- Enrichment download -------------
#* @get /jobs/<id>/enrich/download
function(res, id, type="go", mode="ora", ont="BP", org_db="org.Hs.eg.db",
         kegg_org="hsa", keytype="auto",
         padj_cutoff=0.05, lfc_thresh=1, p_cutoff=0.05, q_cutoff=0.2,
         minGSSize=10, maxGSSize=500, top=NULL, format="csv", a=NULL, b=NULL) {

  job <- get_job(id)
  if (is.null(job) || job$status != "completed") { res$status <- 409; return(list(error="Job not completed")) }
  dds <- readRDS(file.path(job$workdir, "dds.rds"))
  design_col <- job$design_col
  if (is.null(a) || is.null(b)) { levs <- levels(colData(dds)[[design_col]]); if (length(levs) < 2) { res$status <- 400; return(list(error="Not enough levels")) }; a <- levs[1]; b <- levs[2] }

  if (type == "go") {
    params <- list(mode=mode, ont=ont, org_db=org_db, keytype=keytype, a=a, b=b,
                   padj_cutoff=as.numeric(padj_cutoff), lfc_thresh=as.numeric(lfc_thresh),
                   p_cutoff=as.numeric(p_cutoff), q_cutoff=as.numeric(q_cutoff),
                   minGSSize=as.integer(minGSSize), maxGSSize=as.integer(maxGSSize))
    key <- cache_key("GO", params)
    df <- cache_get(job, key)
    if (is.null(df)) {
      OrgDb <- get(org_db, envir = asNamespace(org_db))
      gl <- de_gene_lists(dds, c(design_col, a, b),
                          padj_cutoff=params$padj_cutoff, lfc_thresh=params$lfc_thresh,
                          fromType=keytype, OrgDb=OrgDb)
      if (mode == "ora") {
        eg <- gl$ora; if (length(eg)==0) df <- data.frame() else {
          uni <- gene_universe_from_dds(dds, gl$inferred_keytype, OrgDb)
          df <- as.data.frame(clusterProfiler::enrichGO(
            gene=eg, OrgDb=OrgDb, keyType="ENTREZID", ont=ont, pAdjustMethod="BH",
            pvalueCutoff=params$p_cutoff, qvalueCutoff=params$q_cutoff,
            universe=uni, minGSSize=params$minGSSize, maxGSSize=params$maxGSSize, readable=TRUE
          ))
        }
      } else {
        glist <- gl$gsea; if (length(glist)<10) df <- data.frame() else {
          df <- as.data.frame(clusterProfiler::gseGO(
            geneList=glist, OrgDb=OrgDb, keyType="ENTREZID", ont=ont,
            minGSSize=params$minGSSize, maxGSSize=params$maxGSSize, pvalueCutoff=params$p_cutoff
          ))
          if (!"Count" %in% names(df)) df$Count <- pmax(1, round(df$setSize*0.1))
        }
      }
      cache_put(job, key, df)
    }
    label <- paste0("GO_", ont, "_", mode)
  } else {
    params <- list(mode=mode, kegg_org=kegg_org, keytype=keytype, a=a, b=b,
                   padj_cutoff=as.numeric(padj_cutoff), lfc_thresh=as.numeric(lfc_thresh),
                   p_cutoff=as.numeric(p_cutoff), q_cutoff=as.numeric(q_cutoff),
                   minGSSize=as.integer(minGSSize), maxGSSize=as.integer(maxGSSize))
    key <- cache_key("KEGG", params)
    df <- cache_get(job, key)
    if (is.null(df)) {
      org_db <- if (kegg_org %in% c("hsa")) "org.Hs.eg.db" else if (kegg_org %in% c("mmu")) "org.Mm.eg.db" else "org.Hs.eg.db"
      OrgDb <- get(org_db, envir = asNamespace(org_db))
      gl <- de_gene_lists(dds, c(design_col, a, b),
                          padj_cutoff=params$padj_cutoff, lfc_thresh=params$lfc_thresh,
                          fromType=keytype, OrgDb=OrgDb)
      if (mode == "ora") {
        eg <- gl$ora; if (length(eg)==0) df <- data.frame() else {
          df <- as.data.frame(clusterProfiler::enrichKEGG(
            gene=eg, organism=kegg_org, pvalueCutoff=params$p_cutoff, qvalueCutoff=params$q_cutoff
          ))
        }
      } else {
        glist <- gl$gsea; if (length(glist)<10) df <- data.frame() else {
          df <- as.data.frame(clusterProfiler::gseKEGG(
            geneList=glist, organism=kegg_org, minGSSize=params$minGSSize,
            maxGSSize=params$maxGSSize, pvalueCutoff=params$p_cutoff
          ))
          if (!"Count" %in% names(df)) df$Count <- pmax(1, round(df$setSize*0.1))
        }
      }
      cache_put(job, key, df)
    }
    label <- paste0("KEGG_", kegg_org, "_", mode)
  }

  if (!is.null(top) && !is.na(as.integer(top)) && nrow(df) > 0) {
    ord <- order(df$p.adjust %||% df$pvalue, -df$Count %||% 0)
    df <- head(df[ord, , drop=FALSE], as.integer(top))
  }

  tmp <- tempfile(fileext = if (tolower(format)=="tsv") ".tsv" else ".csv")
  if (tolower(format) == "tsv") {
    readr::write_tsv(df, tmp)
    res$setHeader("Content-Type", "text/tab-separated-values")
    res$setHeader("Content-Disposition", sprintf('attachment; filename=\"%s.tsv\"', label))
  } else {
    readr::write_csv(df, tmp)
    res$setHeader("Content-Type", "text/csv")
    res$setHeader("Content-Disposition", sprintf('attachment; filename=\"%s.csv\"', label))
  }
  include_file(tmp)
}
