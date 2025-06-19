# COMMUNITY Scripts for Cyclone 3DR

Welcome to the **COMMUNITY SCRIPTS** folder of the Leica Cyclone 3DR GitHub repository.

This folder is dedicated to scripts contributed by developers external to Leica Geosystems, aiming to extend the functionality of Cyclone 3DR and provide creative solutions for all users.

## Available scripts
- [_TEMPLATE](./_TEMPLATE/): Folder acting as an example to help understand the expected structure of custom scripts. It is not a valid script.

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
1. Fork the script repository using your GitHub account.
2. Create a new branch
2. Create a new subfolder under `COMMUNITY SCRIPTS/`.
3. Add your script files, a `README.md` file in the script's subfolder. Check the [Guidelines](<# Guidelines for developers>) section for details.
5. Update the [Available scripts](<# Available scripts>) section of this page, if necessary.
6. git commit local changes.
7. git push the created branch on your custom forked repository.
8. Create a pull request to merge your branch to the `master` branch of the Cyclone 3DR Repository.

## Guidelines for developers

To ensure consistency and maintainability, please follow these guidelines when contributing scripts:
- **Code Quality**: Write clean, well-documented, and efficient code.
- **Compatibility**: Ensure your script is compatible with Leica Cyclone 3DR and specify the version it was tested on.
- **Licensing**: Clearly state the license under which your script is distributed.
- **Testing**: Test your script thoroughly before submitting it.
- **Documentation**: Provide clear and detailed documentation in the `README.md` file (check the [README](./_TEMPLATE/README.md) example). The readme file should include the following:
    - A brief introduction containning the script name, explainning the purpose of the script, with the contact (name + email) for any support
    - A `Description` section explaining how to use the script. Idealy, a script output preview in the application (3D scene)
    - A `Tested version` section that list the version of Cyclone 3DR where this script has been tested. For example, "Cyclone 3DR 2025.0.1".
    - A `Licensing` section to describe which edition of Cyclone 3DR is compatible with the script (Standard, Survey, etc.)
    - Idealy, a `Files` section including link to dataset files that will help user to get familiar with your script. Be careful with the size of the data.