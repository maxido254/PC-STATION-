; PCStation Launcher: Windows setup program (Inno Setup 6). The build workflow fills in AppVersion.
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6B0E5C1A-3F52-4D0B-9C7E-7A1D2E8F4B93}
AppName=PCStation Launcher
AppVersion={#AppVersion}
AppPublisher=Maxido Entertainment
DefaultDirName={autopf}\PCStation Launcher
DefaultGroupName=PCStation Launcher
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\PCStation-Launcher.exe
SetupIconFile=..\branding\icon.ico
OutputDir=..\dist
OutputBaseFilename=PCStation-Launcher-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "startup"; Description: "Open the launcher when Windows starts (console style)"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "..\dist\PCStation-Launcher.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\PCStation Launcher"; Filename: "{app}\PCStation-Launcher.exe"
Name: "{autodesktop}\PCStation Launcher"; Filename: "{app}\PCStation-Launcher.exe"; Tasks: desktopicon
Name: "{userstartup}\PCStation Launcher"; Filename: "{app}\PCStation-Launcher.exe"; Tasks: startup

[Run]
Filename: "{app}\PCStation-Launcher.exe"; Description: "Open PCStation Launcher"; Flags: nowait postinstall skipifsilent
