import os
from pathlib import Path
import subprocess
import time

repo_root = Path(__file__).resolve().parent.parent
gdbserver_path = r"C:\ST\STM32CubeCLT_1.22.0\STLink-gdb-server\bin\ST-LINK_gdbserver.exe"
cubeprog_path = r"C:\ST\STM32CubeCLT_1.22.0\STM32CubeProgrammer\bin"
gdb_path = r"C:\ST\STM32CubeCLT_1.22.0\GNU-tools-for-STM32\bin\arm-none-eabi-gdb.exe"
elf_path = str(repo_root / "Sender_station" / "sensor_fusion_transmit" / "sensor_fusion_transmit" / "bin" / "sensor_fusion_transmit.elf")

# Kill any existing ST-LINK_gdbserver
os.system("taskkill /f /im ST-LINK_gdbserver.exe >nul 2>&1")
time.sleep(0.5)

srv_cmd = [gdbserver_path, "-cp", cubeprog_path, "-p", "61234", "-g", "-l", "1"]
srv = subprocess.Popen(srv_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
time.sleep(1.5)

gdb_commands = """
set pagination off
target remote :61234
info registers pc sp lr
bt 5
quit
"""

with open("gdb_cmds.txt", "w") as f:
    f.write(gdb_commands)

try:
    res = subprocess.run([gdb_path, elf_path, "-x", "gdb_cmds.txt", "--batch"],
                         capture_output=True, text=True, timeout=8)
    print("=== GDB OUTPUT ===")
    print(res.stdout)
    if res.stderr:
        print("=== GDB STDERR ===")
        print(res.stderr)
except Exception as e:
    print("Error:", e)
finally:
    srv.terminate()
    try:
        srv.wait(timeout=2)
    except:
        srv.kill()
    if os.path.exists("gdb_cmds.txt"):
        os.remove("gdb_cmds.txt")
