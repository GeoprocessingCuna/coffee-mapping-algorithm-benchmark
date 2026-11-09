# Benchmarking Machine Learning Models for Crop Mapping: The Impact of Training Sample Partitions and Multi-Source Predictors

This repository contains the processing workflows, scripts, and statistical frameworks developed to automate high-precision coffee crop mapping across regional scales using multi-source predictors and cloud computing. This workflow is designed to fulfill the scientific rigor required for international sustainable agriculture governance and European Union Deforestation Regulation (EUDR) compliance.

## 📝 Abstract

The advancement of machine learning algorithms, the increasing availability of remote sensing imagery, and cloud data processing have enabled automated, large-scale crop mapping, reducing manual interpretation dependency and transforming digital image processing into a high-precision tool for spatial data governance. This study applies a systematic screening to evaluate the performance and stability of different machine learning architectures. Sentinel-2 images (year 2018) integrated with climatic, topographic, edaphic, and spectral predictors were processed within the Google Earth Engine (GEE) platform. 

The methodology evaluated the **MaxEnt**, **Random Forest (RF)**, and **Support Vector Machine (SVM)** algorithms operating under three discrete sample partitions (70/30, 75/25, and 80/20) across 10 municipalities in Minas Gerais, Brazil. The final database totaled 19 non-multicollinear variables after a Pearson correlation filtering process. Under the analyzed biogeographical conditions, isothermality, NDVI, Soil Organic Carbon (SOC),pH soil, aspect, and slope were the predominant predictors across all models. 

The applied methodology demonstrated robust performance, achieving Area Under the Curve (AUC) values up to **0.974**, Kappa index (κ) up to **0.880**, and Overall Accuracy up to **0.964**, fluctuating as a function of sample partitioning and geographical territory. The MaxEnt algorithm achieved the highest potential performance in AUC and tolerance to sparse data, whereas Random Forest consolidated itself as the most stable classifier against sample size variations. A localized, decentralized threshold adjustment per municipality eliminated scale distortions, achieving a coefficient of determination (R²) of **0.9993** against official agricultural statistics. These developments confirm that decentralized spatial modeling is significantly more reliable than standardized global workflows, providing the scientific rigor required for international agricultural compliance.

## 🛠️ Repository Structure

```text
├── data_sample/          # Sample dummy dataset (.csv) for execution testing
├── scripts_gee/          # Google Earth Engine JavaScript API scripts for cloud processing
│   └── image_extraction.js
├── scripts_r/            # R scripts for multicollinearity filtering and modeling validation
│   ├── pearson_filter.R
│   └── model_evaluation.R
└── README.md             # Repository documentation and instructions
```

## 📊 Predominant Environmental & Spectral Predictors (19 Total)

After applying a strict Pearson correlation filter to eliminate multicollinearity, the multi-source database was optimized to 19 variables. The most dominant predictors across all modeling pipelines include:
*   **Spectral:** Normalized Difference Vegetation Index (NDVI) derived from Sentinel-2 (2018).
*   **Edaphic:** Soil Organic Carbon (SOC) and pH soil distribution magnitudes.
*   **Climatic:** Isothermality metrics.
*   **Topographic:** Slope and Aspect (terrain orientation).

## 🚀 Getting Started

### Prerequisites

To replicate this decentralized workflow, you will need access to:
1.  A **Google Earth Engine (GEE)** developer account.
2.  **R / RStudio** environment with the following packages installed: `caret`, `corrplot`, `dismo`, `raster`, and `tidyverse`.

### Execution Steps

1.  **Cloud Data Extraction:** Copy the script inside `scripts_gee/image_extraction.js` into the GEE Code Editor to process the 2018 Sentinel-2 collection and extract variables across the 10 target municipalities in Minas Gerais.
2.  **Multicollinearity Filtering:** Run `scripts_r/pearson_filter.R` to process your raw data table and filter spatial variance factors.
3.  **Model Benchmarking:** Execute `scripts_r/model_evaluation.R` to train MaxEnt, RF, and SVM classifiers under the discrete 70/30, 75/25, and 80/20 data partitions.

## 🎓 Authors & Affiliations

*   **Inácio Samuel Cuna** (Corresponding Author) - *Department of Agricultural Engineering, Federal University of Lavras (UFLA)* | *Instituto de Investigação Agrária de Moçambique (IIAM)*

## 📄 License

This project is licensed for academic and scientific reproducibility purposes.
