FROM rocker/r-ver:4.3.2

# System libs (optional but helpful)
RUN apt-get update && apt-get install -y \
    libxml2-dev libcurl4-openssl-dev libssl-dev libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# R packages: CRAN + Bioconductor
RUN R -e "install.packages('BiocManager', repos='https://cloud.r-project.org'); \
          BiocManager::install(c('DESeq2','clusterProfiler','enrichplot','AnnotationDbi','org.Hs.eg.db','org.Mm.eg.db','KEGGREST'), ask=FALSE, update=FALSE); \
          install.packages(c('plumber','jsonlite','readr','dplyr','tidyr','stringr','fs','DBI','RSQLite','callr','digest','tibble'), repos='https://cloud.r-project.org')"

WORKDIR /app
COPY plumber.R /app/

ENV DATA_DIR=/app/data
EXPOSE 8000

CMD ["R","-e","pr <- plumber::plumb('plumber.R'); pr$run(host='0.0.0.0', port=8000)"]
