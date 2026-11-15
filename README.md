# PCStation Launcher

A fullscreen, controller-driven game launcher for Windows, by Maxido Entertainment. It was split out of PCStation Gamepad so it can grow on its own (toward the Godzilla X console experience).

## What it does
- Finds your Steam, Epic and GOG games, or any app you browse to, and shows them with covers, backgrounds and logos.
- Games and Media rows, Control Center, themes, volume, multiple users.
- **Detects controllers:** Xbox pads (XInput), DualSense, DualShock 4, Switch Pro and 8BitDo are noticed as soon as they are connected, with a hint to press a button to start using them. Navigate everything with any controller.
- **FSR with Magpie:** optional. Settings > Display, turn on "FSR upscaling with Magpie". The launcher starts Magpie when you launch a game; set up the FSR profile for the game inside Magpie.
- Phone controllers need the separate PCStation Gamepad app. The launcher works fine without it.

## Install
Download **PCStation-Launcher-Setup.exe** from the latest successful run under the repo's **Actions** tab (artifact `PCStation-Launcher-Setup`), run it, and follow the wizard. Options: desktop shortcut, and "open the launcher when Windows starts". Windows may show a SmartScreen warning because the program is not code-signed yet: choose More info, then Run anyway.
`PCStation-Launcher-Portable` is the same program without the installer.

On first start it imports your library, users and settings from PCStation Gamepad if you had them.

## Develop
```
python -m unittest discover -s src/tests -v     # tests
python src/build_ui.py                            # after editing anything in src/ui_src/
python src/pcstation_launcher_app.py --windowed   # run it
```
`src/ui_src/` holds the page (HTML/CSS/JS); `build_ui.py` embeds it into `pcstation_launcher_ui.py` so the exe is a single file.

## Build
Pushing to `main` runs `.github/workflows/build.yml`: tests on Linux, then on Windows it builds the exe with PyInstaller and the setup program with Inno Setup (`installer/PCStationLauncher.iss`).
