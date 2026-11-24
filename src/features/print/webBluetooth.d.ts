/**
 * Minimal Web Bluetooth surface — just what bluetoothPrinter.ts touches.
 * TypeScript's DOM lib does not ship these; the alternative is the
 * @types/web-bluetooth package, not worth a dependency for one consumer.
 */

interface BluetoothRemoteGATTCharacteristic {
  readonly uuid: string;
  readonly properties: {
    readonly write: boolean;
    readonly writeWithoutResponse: boolean;
  };
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  readonly uuid: string;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}

interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: Array<{ services?: Array<string | number>; namePrefix?: string }>;
  optionalServices?: Array<string | number>;
}

interface Bluetooth {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  readonly bluetooth?: Bluetooth;
}
