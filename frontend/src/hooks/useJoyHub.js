import { useState, useCallback, useEffect, useRef } from 'react';
import socket from '../socket';

/**
 * JoyHub Web Bluetooth Protocol Handler
 * Service: 0000ffa0-0000-1000-8000-00805f9b34fb
 * Characteristic: 0000ffa1-0000-1000-8000-00805f9b34fb
 * Command: [0xff, 0x04, 0x01, 0x00, intensity(0-255)]
 */

const JOYHUB_SERVICE_UUID = '0000ffa0-0000-1000-8000-00805f9b34fb';
const JOYHUB_CHAR_UUID = '0000ffa1-0000-1000-8000-00805f9b34fb';

export function useJoyHub() {
    const [device, setDevice] = useState(null);
    const [characteristic, setCharacteristic] = useState(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [lastIntensity, setLastIntensity] = useState(0);
    const stopTimerRef = useRef(null);

    const connect = useCallback(async () => {
        setIsConnecting(true);
        setError(null);
        try {
            console.log('[JOYHUB] Requesting Bluetooth Device...');
            const bleDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'J-' },
                    { services: [JOYHUB_SERVICE_UUID] }
                ],
                optionalServices: [JOYHUB_SERVICE_UUID]
            });

            console.log('[JOYHUB] Connecting to GATT Server...');
            const server = await bleDevice.gatt.connect();

            console.log('[JOYHUB] Getting Service...');
            const service = await server.getPrimaryService(JOYHUB_SERVICE_UUID);

            console.log('[JOYHUB] Getting Characteristic...');
            const char = await service.getCharacteristic(JOYHUB_CHAR_UUID);

            setDevice(bleDevice);
            setCharacteristic(char);
            setIsConnected(true);

            bleDevice.addEventListener('gattserverdisconnected', () => {
                console.log('[JOYHUB] Device Disconnected');
                setIsConnected(false);
                setCharacteristic(null);
            });

            console.log('[JOYHUB] Connected successfully!');
            return true;
        } catch (err) {
            console.error('[JOYHUB] Connection failed:', err);
            setError(err.message);
            return false;
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const isWriting = useRef(false);
    const writeQueue = useRef([]);

    const processQueue = useCallback(async () => {
        if (isWriting.current || writeQueue.current.length === 0 || !characteristic) return;

        isWriting.current = true;
        const intensity = writeQueue.current.shift();

        try {
            // intensity is 0-255
            // Updated to use the 0xa0 protocol found in the TrueForm reference bridge:
            // [0xa0, 0x0c, 0x00, 0x00, power_flag, speed]
            const data = new Uint8Array([0xa0, 0x0c, 0x00, 0x00, intensity === 0 ? 0 : 1, intensity]);

            // Try writeValue (modern) or writeValueWithoutResponse (faster)
            if (characteristic.writeValueWithoutResponse) {
                await characteristic.writeValueWithoutResponse(data);
            } else if (characteristic.writeValue) {
                await characteristic.writeValue(data);
            }

            setLastIntensity(intensity);
            if (intensity > 0) console.log(`[JOYHUB] Physically wrote intensity: ${intensity} (Protocol: 0xa0)`);
        } catch (err) {
            console.error('[JOYHUB] Vibrate failed:', err.message || err);
        } finally {
            isWriting.current = false;
            // Short delay to let hardware breathe - reduced for latency
            setTimeout(processQueue, 35);
        }
    }, [characteristic]);

    const vibrate = useCallback((intensity) => {
        // Keep queue small to stay responsive - only store the latest intensity
        // if we are already busy, to avoid "laggy" vibration
        if (writeQueue.current.length > 2) {
            writeQueue.current = [intensity];
        } else {
            writeQueue.current.push(intensity);
        }
        processQueue();
    }, [processQueue]);

    const disconnect = useCallback(() => {
        if (device && device.gatt && device.gatt.connected) {
            try {
                device.gatt.disconnect();
                console.log('[JOYHUB] GATT Disconnected manually');
            } catch (e) {
                console.error('[JOYHUB] Disconnect error:', e);
            }
        }
        setIsConnected(false);
        setCharacteristic(null);
        setDevice(null);
        writeQueue.current = [];
        isWriting.current = false;
        setLastIntensity(0);
    }, [device]);

    // Socket Listener for Backend Commands
    useEffect(() => {
        if (!isConnected) return;

        const handleVibrate = (data) => {
            console.log('[JOYHUB] Socket Vibrate Signal:', data);
            // data.intensity is 0-255 (calculated by backend)
            vibrate(data.intensity);

            // Handle duration (auto-stop)
            if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            if (data.duration && data.intensity > 0) {
                const ms = data.duration * 1000;
                stopTimerRef.current = setTimeout(() => {
                    console.log(`[JOYHUB] Auto-stopping after ${ms}ms`);
                    vibrate(0);
                }, ms);
            }
        };

        socket.on('joyhub:vibrate', handleVibrate);
        return () => {
            socket.off('joyhub:vibrate', handleVibrate);
            if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
        };
    }, [isConnected, vibrate]);

    return { connect, disconnect, vibrate, isConnected, isConnecting, error, lastIntensity };
}
