# RTC360 scanner tools 

<img src="./Leica-RTC360.jpg" width="800" alt="RTC360">

This folder contains utility scripts allowing to interact directly with [Leica RTC360](https://leica-geosystems.com/products/laser-scanners/scanners/leica-rtc360) scanners.


## [ImportLocalJob.js](./ImportLocalJob.js)

Simple script shows how to to import RTC360 job scans (raw data) from a specified local directory.

A sample data [Job 001-Vkwn.zip](./Job%20001-Vkwn.zip) is available for testing. Just unzip it and select the folder after launching the script.

> The script assumes that the raw data have been previously exported from the scanner.

## [RemoteJob_And_ImportJob.js](./RemoteJob_And_ImportJob.js)

This script demonstrates how to communicate directly with the scanner. 

From job creation to direct import into the Cyclone 3DR project, it allows automating the entire scanning process. 

> This script requires the scanner to be connected to the same network as the computer running the Cyclone 3DR.

## ⚠️ Limitations 

- Importing jobs with more than 10 scans at once may take a significant amount of time.
- Images are not supported