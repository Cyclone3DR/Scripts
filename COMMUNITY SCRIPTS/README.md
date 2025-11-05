# COMMUNITY Scripts for Cyclone 3DR

Welcome to the **COMMUNITY SCRIPTS** folder of the Leica Cyclone 3DR GitHub repository.

This folder is dedicated to scripts contributed by developers external to Leica Geosystems, aiming to extend the functionality of Cyclone 3DR and provide creative solutions for all users.

## Available scripts
- [_TEMPLATE](./_TEMPLATE/): Folder acting as an example to help understand the expected structure of custom scripts. It is not a valid script.
- [Large Scale Ortho Image](./Large%20Scale%20Ortho%20Image): Functionality to export large scale top-down orthographic images from LGSx data. (LIDAR and IMAGE)
- [Swisstopo validation](./Swisstopo%20validation): Interactive quality control tool for comparing elevation data against Swisstopo reference heights.
- [Swisstopo systematic validation](./Swisstopo%20systematic%20validation): Grid-based validation of point cloud heights against official Swisstopo reference data.
- [Automated Measurements](./Automated%20Measurements): Functionality to automatically extract linear, angular, and perpendicular measurements in a predefined order and compare them with nominal values.

## ⚠️ Disclaimer ⚠️

Scripts in this folder are created and maintained by external developers and are not officially supported by Leica Geosystems. Use them at your own discretion. 

Leica Geosystems is not responsible for any issues or damages caused by these scripts.

## Folder Structure

Each script is stored in a dedicated subfolder. The structure is as follows:

```
COMMUNITY SCRIPTS/ 
├── Script-1/ 
│ ├── script-file.js 
│ ├── README.md
│ ├── screenshot.png
│ └── other-files...
├── Script-2/
│ ├── script-file.js
│ └── ...
├── ...  
└── 
```

## Contributing

To contribute with a new script:
1. Fork the script repository using your GitHub account:
```shell
# Open a terminal at a valid working directory
mkdir Cyclone3DR_Scripts
git clone "https://github.com/Cyclone3DR/Scripts.git" ./Cyclone3DR_Scripts
cd Cyclone3DR_Scripts
```
2. Create a new branch:
```shell
git checkout -b "name_of_the_branch" master
```
3. Create a new subfolder under `COMMUNITY SCRIPTS/`.
4. Add your script files:
    - A `README.md` file in the script's subfolder. Check the [Guidelines](<#guidelines-for-developers>) section for details.
    - Update the [Available scripts](<#available-scripts>) section of this page, if necessary.
5. git commit local changes:
```shell
git add .
git commit -m "Adding a new script to COMMUNITY SCRIPT"
```
7. Push the created branch:
```shell
git push -u origin "name_of_the_branch" master
```
8. Create a pull request to merge your branch to the `master` branch of the Cyclone 3DR Repository:
Open this url (don't forget to edit the link): https://github.com/Cyclone3DR/Scripts/pull/new/name_of_the_branch


## Guidelines for developers

To ensure consistency and maintainability, please follow these guidelines when contributing scripts:
- **Code Quality**: Write clean, well-documented, and efficient code.
- **Compatibility**: Ensure your script is compatible with Leica Cyclone 3DR and specify the version it was tested on.
- **Licensing**: Clearly state the license under which your script is distributed.
- **Testing**: Test your script thoroughly before submitting it.
- **Ressources**: To help users get the most out of your script, we encourage you to include relevant datasets or tutorial videos. However, to keep this repository lightweight and efficient, please follow these rules:
    - **Minimal datasets only**  
    You may include files up to **100 MB** in size. If your dataset exceeds this limit, please host it externally (e.g., Google Drive, Dropbox, etc.) and link to it in your README.
    - **No video uploads ⛔**  
    Videos should not be stored directly in the repository. Instead, please host your tutorials on platforms like **YouTube**, **Vimeo**, or any other video streaming service, and share the link.
- **Documentation**: Provide clear and detailed documentation in the `README.md` file (check the [README](./_TEMPLATE/README.md) example). The readme file should include the following:
    - A brief introduction containning the script name, explainning the purpose of the script, with the contact (name + email) for any support
    - A `Description` section explaining how to use the script. Idealy, a script output preview in the application (3D scene)
    - A `Tested version` section that list the version of Cyclone 3DR where this script has been tested. For example, "Cyclone 3DR 2025.0.1".
    - A `Licensing` section to describe which edition of Cyclone 3DR is compatible with the script (Standard, Survey, etc.)
    - Idealy, a `Files` section including link to dataset files that will help user to get familiar with your script. Be careful with the size of the data.
