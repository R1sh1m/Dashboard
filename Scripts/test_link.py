import serial
import time
import threading
import sys

stop_flag = False

def reader_stm(port):
    global stop_flag
    try:
        s = serial.Serial(port, 115200, timeout=0.2)
        last_tx = None
        t0 = time.time()
        while time.time() - t0 < 60 and not stop_flag:
            l = s.readline()
            if l:
                text = l.decode('utf-8', errors='replace').strip()
                if "TX=" in text or "TX_TRY" in text or "radio_send" in text:
                    print(f"[STM32_TX] {text}", flush=True)
                    if "TX=" in text:
                        parts = text.split("TX=")
                        if len(parts) > 1:
                            tx_val = parts[1].split()[0]
                            if last_tx is None:
                                last_tx = tx_val
                            elif tx_val != last_tx:
                                print(f"*** DETECTED TX INCREMENT: {last_tx} -> {tx_val} ***", flush=True)
                                last_tx = tx_val
        s.close()
    except Exception as e:
        print(f"[STM32 ERROR] {e}", flush=True)

def reader_esp(port):
    global stop_flag
    try:
        s = serial.Serial(port, 115200, timeout=0.2)
        t0 = time.time()
        while time.time() - t0 < 60 and not stop_flag:
            l = s.readline()
            if l:
                text = l.decode('utf-8', errors='replace').strip()
                if text:
                    print(f"[ESP32_RX] {text}", flush=True)
                    if "RX_DONE" in text or "{" in text:
                        print(f"*** RECEIVED PACKET / TELEMETRY ON ESP32! ***", flush=True)
        s.close()
    except Exception as e:
        print(f"[ESP32 ERROR] {e}", flush=True)

t1 = threading.Thread(target=reader_esp, args=('COM3',))
t2 = threading.Thread(target=reader_stm, args=('COM10',))
t1.start()
t2.start()
t1.join()
t2.join()


