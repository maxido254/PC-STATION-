"""PCStation Launcher: the program the installer puts on the PC. Starts the launcher and opens it fullscreen.

Options:  --windowed   open in a normal window instead of fullscreen
"""
import json
import os
import sys
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


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    directory = launcher.data_dir()
    url = running_instance(directory)
    if url:                                                            # already running: just bring it up
        webbrowser.open(url)
        return 0
    launcher.import_legacy_data(directory)
    try:
        srv = launcher.Launcher(directory=directory).start()
    except Exception as exc:
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, f"Could not start the launcher:\n{exc}", "PCStation Launcher", 0x10)
        except Exception:
            print("Could not start the launcher:", exc, file=sys.stderr)
        return 1
    write_running(directory, srv)
    try:
        srv.open_ui(fullscreen="--windowed" not in argv)
        if srv.browser_proc is None:
            quit_window(srv)
        else:
            while not srv.quit.is_set() and srv.browser_proc.poll() is None:
                time.sleep(0.4)
    except KeyboardInterrupt:
        pass
    finally:
        srv.stop()
        clear_running(directory)
    return 0


if __name__ == "__main__":
    sys.exit(main())
