# COMMUNITY Scripts for Cyclone 3DR

Welcome to the **COMMUNITY SCRIPTS** folder of the Leica Cyclone 3DR GitHub repository.

This folder is dedicated to scripts contributed by developers external to Leica Geosystems, aiming to extend the functionality of Cyclone 3DR and provide creative solutions for all users.

## Available scripts
- [_TEMPLATE](./_TEMPLATE/): Folder acting as an example to help understand the expected structure of custom scripts. It is not a valid script.
- [Large Scale Ortho Image](./Large%20Scale%20Ortho%20Image): Functionality to export large scale top-down orthographic images from LGSx data. (LIDAR and IMAGE)
- [Swisstopo validation](./Swisstopo%20validation): Interactive quality control tool for comparing elevation data against Swisstopo reference heights.
- [Swisstopo systematic validation](./Swisstopo%20systematic%20validation): Grid-based validation of point cloud heights against official Swisstopo reference data.
- [Automated Measurements](./Automated%20Measurements): Functionality to automatically extract linear, angular, and perpendicular measurements in a predefined order and compare them with nominal values.
- [CRKennedy-Tutorials](./CRKennedy-Tutorials/): Collection of scripts to help beginners getting familiar with script API.
- [Cyclone 3DR Scripting Webinar - March, 2026](./Cyclone%203DR%20Scripting%20Webinar%20Series%20-%20Tips'n%20Trick%20-%20March,%202026): Script serving as a support for the scripting webinar series.
- [NavVis Panoramas to Floor Plans](./NavVis%20Panoramas%20to%20Floor%20Plans): Import NavVis panoramas + a registered cloud, then export per-building / per-level georeferenced floor-plan orthophotos with the panos on each floor, ready for a 360° pano-viewer web app.
- [Tree Trunk Extraction](./Global%20Survey%20NZ/Tree%20Trunk%20Extraction): Automates the extraction of tree trunks from point clouds in Leica Cyclone 3DR using volumetric logic and topographical projections.
- [Pipe Crown Extraction](./Global%20Survey%20NZ/Pipe%20Crown%20Extraction/): An advanced, highly robust Cyclone 3DR JavaScript script designed to extract the true geometric apex (crown) of a pipe from noisy, raw 3D point cloud data.
- [Profile Extraction](./Global%20Survey%20NZ/Profile%20Extraction/): Automates the extraction of a cross-section profile and calculates a theoretical intersection point.

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

1. Fork the script repository using your GitHub account
1. Clone the fork localy
1. Create a new branch
1. Add your script:
    - Create a new subfolder under `COMMUNITY SCRIPTS/`
    - Add your script files
        - A `README.md` file in the script's subfolder (check the [guidelines](<#guidelines-for-developers>))
        - Update the [Available scripts](<#available-scripts>) section of this page, if necessary.
1. Commit local changes and  push the created branch to the fork
1. Finaly, go back to GitHub interface and [create a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork#syncing-a-fork-branch-from-the-web-ui) to merge your work to the Cyclone 3DR repository
1. Your work will then be reviewed by our team

Here are the corresponding **git** instructions:

```shell
# 2. Clone the fork localy
mkdir Cyclone3DR_Scripts
git clone "FORK_URL" ./Cyclone3DR_Scripts
cd Cyclone3DR_Scripts

# 3. Create a new branch
git checkout -b "name_of_the_branch" master

# 4 has to be done manualy, outside of the terminal...

# 5. Commit local changes and  push the created branch to the fork
git add .
git commit -m "Adding a new script to COMMUNITY SCRIPT"
git push -u origin "name_of_the_branch" master
```

## Guidelines for developers

To ensure consistency and maintainability, please follow these guidelines when contributing scripts:
- **Code Quality**: Write clean, well-documented, and efficient code.
- **Compatibility**: Ensure your script is compatible with Leica Cyclone 3DR and specify the version it was tested on.
- **Licensing**: Clearly state the license under which your script is distributed.
- **Testing**: Test your script thoroughly before submitting it.
- **Resources**: To help users get the most out of your script, we encourage you to include relevant datasets or tutorial videos. However, to keep this repository lightweight and efficient, please follow these rules:
    - **⚠️Minimal datasets only**  
    You may include files up to **100 MB** in size. If your dataset exceeds this limit, please host it externally (e.g., Google Drive, Dropbox, etc.) and link to it in your README.
    - **⛔ Videos are not allowed**  
    Videos should not be stored directly in the repository. Instead, please host your tutorials on platforms like **YouTube**, **Vimeo**, or any other video streaming service, and share the link.
- **Documentation**: Provide clear and detailed documentation in the `README.md` file (check the [README](./_TEMPLATE/README.md) example). The readme file should include the following:
    - A brief introduction containing the script name, explaining the purpose of the script, with the contact (name + email) for any support
    - A `Description` section explaining how to use the script. Ideally, a script output preview in the application (3D scene)
    - A `Tested version` section that list the version of Cyclone 3DR where this script has been tested. For example, "Cyclone 3DR 2025.0.1".
    - A `Licensing` section to describe which edition of Cyclone 3DR is compatible with the script (Standard, Survey, etc.)
    - Ideally, a `Files` section including link to dataset files that will help user to get familiar with your script. Be careful with the size of the data.
