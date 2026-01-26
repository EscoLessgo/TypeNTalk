import { useState, useCallback, useEffect } from 'react';
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

    const vibrate = useCallback(async (intensity) => {
        if (!characteristic) return;

        try {
            // intensity is 0-255
            const data = new Uint8Array([0xff, 0x04, 0x01, 0x00, intensity]);
            await characteristic.writeValue(data);
            setLastIntensity(intensity);
        } catch (err) {
            console.error('[JOYHUB] Vibrate failed:', err);
        }
    }, [characteristic]);

    const disconnect = useCallback(() => {
        if (device && device.gatt.connected) {
            device.gatt.disconnect();
        }
        setIsConnected(false);
        setCharacteristic(null);
        setDevice(null);
    }, [device]);

    // Socket Listener for Backend Commands
    useEffect(() => {
        if (!isConnected) return;

        const handleVibrate = (data) => {
            console.log('[JOYHUB] Socket Vibrate Signal:', data);
            // data.intensity is 0-255 (calculated by backend)
            vibrate(data.intensity);
        };

        socket.on('joyhub:vibrate', handleVibrate);
        return () => socket.off('joyhub:vibrate', handleVibrate);
    }, [isConnected, vibrate]);

    return { connect, disconnect, vibrate, isConnected, isConnecting, error, lastIntensity };
}
