import type { HRReading, ConnectionState, DataSourceInterface } from '../types';

export class BLEService implements DataSourceInterface {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private hrCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private running = false;

  onReading: ((reading: HRReading) => void) | null = null;
  onConnectionChange: ((state: ConnectionState) => void) | null = null;
  onBatteryUpdate: ((level: number) => void) | null = null;

  static isSupported(): boolean {
    return 'bluetooth' in navigator;
  }

  async requestDevice(): Promise<void> {
    if (!BLEService.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge.');
    }

    this.onConnectionChange?.('connecting');

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Polar Sense' }],
        optionalServices: [0x180d, 0x180f], // Heart Rate + Battery
      });

      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
      await this.connectToDevice();
    } catch (err) {
      this.onConnectionChange?.('disconnected');
      throw err;
    }
  }

  private async connectToDevice(): Promise<void> {
    if (!this.device?.gatt) return;

    this.onConnectionChange?.('connecting');

    try {
      this.server = await this.device.gatt.connect();

      // Subscribe to Heart Rate
      const hrService = await this.server.getPrimaryService(0x180d);
      this.hrCharacteristic = await hrService.getCharacteristic(0x2a37);
      this.hrCharacteristic.addEventListener('characteristicvaluechanged', this.handleHRData);
      await this.hrCharacteristic.startNotifications();

      // Read battery level
      try {
        const batteryService = await this.server.getPrimaryService(0x180f);
        const batteryChar = await batteryService.getCharacteristic(0x2a19);
        const batteryValue = await batteryChar.readValue();
        this.onBatteryUpdate?.(batteryValue.getUint8(0));
      } catch {
        // Battery service might not be available
      }

      this.reconnectAttempts = 0;
      this.onConnectionChange?.('connected');
    } catch (err) {
      this.onConnectionChange?.('disconnected');
      throw err;
    }
  }

  private handleHRData = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;

    const reading = this.parseHRMeasurement(value);
    this.onReading?.(reading);
  };

  private parseHRMeasurement(data: DataView): HRReading {
    const flags = data.getUint8(0);
    const is16Bit = flags & 0x01;
    const hasRR = flags & 0x10;
    const hasEnergy = flags & 0x08;

    const bpm = is16Bit ? data.getUint16(1, true) : data.getUint8(1);
    let offset = is16Bit ? 3 : 2;

    if (hasEnergy) offset += 2;

    const rrIntervals: number[] = [];
    if (hasRR) {
      while (offset < data.byteLength) {
        const rr = data.getUint16(offset, true);
        rrIntervals.push((rr / 1024) * 1000); // Convert to ms
        offset += 2;
      }
    }

    return {
      bpm,
      timestamp: Date.now(),
      rrIntervals: rrIntervals.length > 0 ? rrIntervals : undefined,
    };
  }

  private onDisconnected = (): void => {
    if (!this.running) {
      this.onConnectionChange?.('disconnected');
      return;
    }

    this.onConnectionChange?.('reconnecting');
    this.attemptReconnect();
  };

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onConnectionChange?.('disconnected');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000;

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connectToDevice();
    } catch {
      this.attemptReconnect();
    }
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  disconnect(): void {
    this.running = false;
    if (this.hrCharacteristic) {
      this.hrCharacteristic.removeEventListener('characteristicvaluechanged', this.handleHRData);
    }
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.hrCharacteristic = null;
    this.onConnectionChange?.('disconnected');
  }

  getDeviceName(): string | null {
    return this.device?.name ?? null;
  }
}
