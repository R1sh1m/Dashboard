import sys
import time
import serial

port = 'COM10'
baud = 115200

print(f"Connecting to {port} @ {baud}...")
try:
    s = serial.Serial(port, baud, timeout=1)
except Exception as e:
    print(f"Failed to open {port}: {e}")
    sys.exit(1)

print("Connected. Reading for 6 seconds:")
start = time.time()
while time.time() - start < 6:
    line = s.readline()
    if line:
        try:
            print(line.decode('utf-8', errors='replace').rstrip())
        except Exception:
            print(repr(line))

s.close()
print("Done reading.")

