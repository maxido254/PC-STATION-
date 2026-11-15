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
Source: "..\dist\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedsWebView2

[Icons]
Name: "{autoprograms}\PCStation Launcher"; Filename: "{app}\PCStation-Launcher.exe"
Name: "{autodesktop}\PCStation Launcher"; Filename: "{app}\PCStation-Launcher.exe"; Tasks: desktopicon
Name: "{userstartup}\PCStation Launcher"; Filename: "{app}\PCStation-Launcher.exe"; Tasks: startup

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing the Microsoft WebView2 Runtime (the window engine)..."; Flags: waituntilterminated; Check: NeedsWebView2
Filename: "{app}\PCStation-Launcher.exe"; Description: "Open PCStation Launcher"; Flags: nowait postinstall skipifsilent

[Code]
function HasWebView2(): Boolean;
var v: String;
begin
  Result := RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v)
         or RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v)
         or RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v);
  if Result then Result := (v <> '') and (v <> '0.0.0.0');
end;

function NeedsWebView2(): Boolean;
begin
  Result := not HasWebView2();
end;
