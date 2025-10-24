# RNA-seq Data Analysis Platform (RNA-seq SaaS)

A web-based RNA sequencing data analysis platform providing differential expression analysis, functional enrichment analysis, and visualization capabilities. This project uses a microservices architecture with Next.js frontend and R Plumber API backend.

## 🚀 Features

### Core Analysis Features
- **Differential Expression Analysis**: DESeq2-based differential gene expression detection
- **Volcano Plot Visualization**: Interactive volcano plots for differential expression results
- **PCA Analysis**: Principal component analysis for sample relationship visualization
- **Functional Enrichment Analysis**: GO and KEGG pathway enrichment analysis support
- **Enrichment Result Visualization**: Dot plots, bar plots, and table displays

### Technical Features
- **Asynchronous Task Processing**: Background analysis tasks with real-time status updates
- **Result Caching**: Smart caching mechanism for improved repeated query efficiency
- **Data Export**: CSV/TSV format result downloads
- **Responsive Design**: Modern web interface with mobile support

## 🏗️ Project Architecture

```
rnaseq-saas/
├── Apollo/                 # R Plumber API Backend
│   ├── Dockerfile         # Backend container configuration
│   └── plumber.R          # API service code
├── Pythia/                # Next.js Frontend Application
│   ├── app/               # Next.js 13+ App Router
│   ├── components/        # React components
│   ├── lib/               # Utility functions
│   └── package.json       # Frontend dependency configuration
├── sample_data/           # Sample data
│   ├── counts.csv         # Gene expression count matrix
│   └── metadata.csv       # Sample metadata
└── docker-compose.yml     # Container orchestration configuration
```

## 🛠️ Tech Stack

### Backend (Apollo)
- **R Plumber**: RESTful API framework
- **DESeq2**: Differential expression analysis
- **clusterProfiler**: Functional enrichment analysis
- **SQLite**: Task status management
- **Docker**: Containerized deployment

### Frontend (Pythia)
- **Next.js 16**: React framework
- **TypeScript**: Type safety
- **Plotly.js**: Interactive charts
- **React Plotly.js**: React integration

## 📦 Installation & Deployment

### Using Docker Compose (Recommended)

1. **Clone the project**
```bash
git clone <repository-url>
cd rnaseq-saas
```

2. **Start services**
```bash
docker-compose up -d
```

3. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

### Manual Deployment

#### Backend Deployment
```bash
cd Apollo
# Install R dependencies
Rscript -e "install.packages(c('plumber', 'DESeq2', 'clusterProfiler', 'org.Hs.eg.db', 'org.Mm.eg.db', 'readr', 'dplyr', 'tidyr', 'stringr', 'fs', 'DBI', 'RSQLite', 'callr', 'tibble', 'digest', 'AnnotationDbi'))"

# Start API service
Rscript plumber.R
```

#### Frontend Deployment
```bash
cd Pythia
npm install
npm run dev
```

## 📊 Usage Guide

### 1. Data Preparation

Prepare two CSV files:

**Gene Expression Count Matrix (counts.csv)**
```csv
gene,S1,S2,S3,S4
GeneA,10,22,200,150
GeneB,0,1,50,70
GeneC,500,520,40,30
```

**Sample Metadata (metadata.csv)**
```csv
sample,condition,batch
S1,treated,A
S2,treated,A
S3,control,B
S4,control,B
```

### 2. Analysis Workflow

1. **Upload Data**: Upload count matrix and metadata files through the web interface
2. **Configure Parameters**: Set design matrix column name (e.g., "condition")
3. **Run Analysis**: System automatically performs DESeq2 analysis
4. **View Results**: 
   - Volcano Plot: Display differentially expressed genes
   - PCA Plot: Sample clustering analysis
   - Results Table: Detailed statistical results
5. **Functional Enrichment**: Perform GO/KEGG pathway enrichment analysis
6. **Export Results**: Download analysis result files

### 3. API Endpoints

#### Create Analysis Job
```bash
POST /jobs
Content-Type: multipart/form-data

# Form data:
# - counts: Count matrix file
# - metadata: Metadata file
# - design_col: Design matrix column name
```

#### Query Job Status
```bash
GET /jobs/{job_id}/status
```

#### Get Analysis Results
```bash
GET /jobs/{job_id}/results?padj_cutoff=0.05&lfc_thresh=1
```

#### Functional Enrichment Analysis
```bash
GET /jobs/{job_id}/enrich/go?mode=ora&ont=BP&org_db=org.Hs.eg.db
GET /jobs/{job_id}/enrich/kegg?mode=ora&kegg_org=hsa
```

## 🔧 Configuration Options

### Differential Expression Analysis Parameters
- `padj_cutoff`: Adjusted p-value threshold (default: 0.05)
- `lfc_thresh`: Log fold change threshold (default: 1)
- `top_n`: Return top N results (default: 100)

### Enrichment Analysis Parameters
- `mode`: Analysis mode ("ora" or "gsea")
- `ont`: GO ontology ("BP", "CC", "MF")
- `org_db`: Species database ("org.Hs.eg.db", "org.Mm.eg.db")
- `kegg_org`: KEGG species code ("hsa", "mmu")

## 🧪 Sample Data

The project includes sample data files for testing:
- `sample_data/counts.csv`: Simulated gene expression data
- `sample_data/metadata.csv`: Sample grouping information

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For questions or suggestions, please:
- Submit an [Issue](https://github.com/your-repo/issues)
- Send an email to: your-email@example.com

## 🙏 Acknowledgments

- [DESeq2](https://bioconductor.org/packages/DESeq2/) - Differential expression analysis
- [clusterProfiler](https://bioconductor.org/packages/clusterProfiler/) - Functional enrichment analysis
- [Plumber](https://www.rplumber.io/) - R API framework
- [Next.js](https://nextjs.org/) - React framework
- [Plotly.js](https://plotly.com/javascript/) - Data visualization
