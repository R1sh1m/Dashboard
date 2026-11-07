import threading
import time
import subprocess
import serial

port = 'COM10'
baud = 115200

def trigger_reset():
    time.sleep(1.0)
    print(">>> Triggering Hardware Reset via ST-LINK...")
    subprocess.run([
        r'C:\ST\STM32CubeCLT_1.22.0\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe',
        '-c', 'port=SWD', '-hardRst'
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(">>> Reset sent.")

t = threading.Thread(target=trigger_reset)

with serial.Serial(port, baud, timeout=0.5) as s:
    print(f"Connected to {port}. Starting reset thread...")
    t.start()
    start = time.time()
    while time.time() - start < 18:
        line = s.readline()
        if line:
            txt = line.decode('utf-8', 'ignore').rstrip()
            if txt:
                print(txt)

t.join()

