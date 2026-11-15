"""PCStation Launcher: the program the installer puts on the PC. Starts the launcher and opens it fullscreen.

Options:  --windowed   open in a normal window instead of fullscreen
"""
import json
import os
import sys
import threading
import time
import urllib.request
import webbrowser

import pcstation_launcher as launcher

RUNNING = "running.json"


def running_instance(directory):
    """URL of a launcher that is already running (so a second start just shows it), else None."""
    try:
        with open(os.path.join(directory, RUNNING), "r", encoding="utf-8") as f:
            d = json.load(f)
        req = urllib.request.Request(f"http://127.0.0.1:{d['port']}/api/library", headers={"X-Token": d["token"]})
        with urllib.request.urlopen(req, timeout=1.5):
            pass
        return f"http://127.0.0.1:{d['port']}/?t={d['token']}"
    except Exception:
        return None


def show_existing(directory):
    """Ask the running launcher to bring its window forward. False if it could not be reached."""
    try:
        with open(os.path.join(directory, RUNNING), "r", encoding="utf-8") as f:
            d = json.load(f)
        req = urllib.request.Request(f"http://127.0.0.1:{d['port']}/api/show", data=b"{}",
                                     headers={"X-Token": d["token"], "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=1.5):
            return True
    except Exception:
        return False


class NativeApi:
    """Functions the page can call when it runs inside the app window (Windows' own file dialogs)."""

    def __init__(self):
        self._window = None
        self._webview = None

    def pick_file(self, kind="exe"):
        wv, win = self._webview, self._window
        if not wv or not win:
            return ""
        types = ("Pictures (*.jpg;*.jpeg;*.png;*.webp)", "All files (*.*)") if kind == "image" else \
                ("Programs and shortcuts (*.exe;*.lnk;*.bat;*.cmd;*.url)", "All files (*.*)")
        dialog = getattr(getattr(wv, "FileDialog", None), "OPEN", None)
        if dialog is None:
            dialog = wv.OPEN_DIALOG
        res = win.create_file_dialog(dialog, allow_multiple=False, file_types=types)
        return res[0] if res else ""


def run_window(srv, fullscreen):
    """Show the launcher in its own app window (no browser, no address bar). False if that is not possible here."""
    try:
        import webview
    except Exception:
        return False
    os.environ.setdefault("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--autoplay-policy=no-user-gesture-required --disable-features=Translate")
    api = NativeApi()
    try:
        window = webview.create_window("PCStation Launcher", srv.url, width=1280, height=720, fullscreen=fullscreen,
                                       js_api=api, background_color="#04060b")
        api._window, api._webview = window, webview

        def watcher():
            while True:
                if srv.quit.is_set():
                    try:
                        window.destroy()
                    except Exception:
                        pass
                    return
                if srv.show.is_set():
                    srv.show.clear()
                    for fn in ("restore", "show"):
                        try:
                            getattr(window, fn)()
                        except Exception:
                            pass
                time.sleep(0.3)
        threading.Thread(target=watcher, daemon=True).start()
        webview.start(gui="edgechromium" if os.name == "nt" else None)
        return True
    except Exception:
        return False


def write_running(directory, srv):
    try:
        with open(os.path.join(directory, RUNNING), "w", encoding="utf-8") as f:
            json.dump({"port": srv.port, "token": srv.token, "pid": os.getpid()}, f)
    except OSError:
        pass


def clear_running(directory):
    try:
        os.remove(os.path.join(directory, RUNNING))
    except OSError:
        pass


def quit_window(srv):
    """Only used when no Edge/Chrome/Brave was found and the page opened in a normal browser tab."""
    import tkinter as tk
    root = tk.Tk()
    root.title("PCStation Launcher")
    root.geometry("360x150")
    root.configure(bg="#0f1318")
    tk.Label(root, text="PCStation Launcher is running", bg="#0f1318", fg="#e6edf3", font=("Segoe UI", 12, "bold")).pack(pady=(18, 4))
    tk.Label(root, text="It is open in your web browser.", bg="#0f1318", fg="#9fb0c3", font=("Segoe UI", 10)).pack()
    tk.Button(root, text="Open again", command=lambda: webbrowser.open(srv.url)).pack(side="left", padx=40, pady=20)
    tk.Button(root, text="Quit", command=root.destroy).pack(side="right", padx=40, pady=20)

    def watch():
        if srv.quit.is_set():
            root.destroy()
        else:
            root.after(500, watch)
    watch()
    root.mainloop()


def message(text):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, text, "PCStation Launcher", 0x10)
    except Exception:
        print(text, file=sys.stderr)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    directory = launcher.data_dir()
    url = running_instance(directory)
    if url:                                                            # already running: bring its window forward
        if not show_existing(directory):
            webbrowser.open(url)
        return 0
    launcher.import_legacy_data(directory)
    try:
        srv = launcher.Launcher(directory=directory).start()
    except Exception as exc:
        message(f"Could not start the launcher:\n{exc}")
        return 1
    write_running(directory, srv)
    try:
        fullscreen = "--windowed" not in argv
        if "--browser" in argv:                                        # developer option only: show it in a web browser
            started = time.time()
            srv.open_ui(fullscreen=fullscreen)
            if srv.browser_proc is None or time.time() - started < 8:
                quit_window(srv)
            else:
                while not srv.quit.is_set() and srv.browser_proc.poll() is None:
                    time.sleep(0.4)
        elif not run_window(srv, fullscreen):                          # never falls back to Edge: explain what is missing instead
            message("PCStation Launcher could not open its window.\n\nIt needs the Microsoft WebView2 Runtime. "
                    "Reinstall PCStation Launcher (the setup installs it), or install it from:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703")
            return 1
    except KeyboardInterrupt:
        pass
    finally:
        srv.stop()
        clear_running(directory)
    return 0


if __name__ == "__main__":
    sys.exit(main())
