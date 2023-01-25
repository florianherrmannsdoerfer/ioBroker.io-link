'use strict';

// The adapter-core module gives you access to the core ioBroker functions
const utils = require('@iobroker/adapter-core');

// you need to create an adapter
const adapter = new utils.Adapter('io-link');

// additional required packackages
const axios = require('axios');

//DeviceSpec class
const DeviceSpec = require('./devicespec.js')

const getPortData = async (/** @type {string} */ endpoint, /** @type {number} */ iolinkport, /** @type {string} */ portschannelpath, /** @type {DeviceSpec | null} */ devicespec) => {
    try {
        //sensor info and process data requests
        let requestSensorComSpeed = getRequestBody(`/iolinkmaster/port[${iolinkport}]/comspeed/getdata`);
        let requestSensorCycletime = getRequestBody(`/iolinkmaster/port[${iolinkport}]/mastercycletime_actual/getdata`);

        let requestSensorVendorId = getRequestBody(`/iolinkmaster/port[${iolinkport}]/iolinkdevice/vendorid/getdata`);
        let requestSensorId = getRequestBody(`/iolinkmaster/port[${iolinkport}]/iolinkdevice/deviceid/getdata`);
        let requestSensorName = getRequestBody(`/iolinkmaster/port[${iolinkport}]/iolinkdevice/productname/getdata`);
        let requestDeviceSn = getRequestBody(`/iolinkmaster/port[${iolinkport}]/iolinkdevice/serial/getdata`);
        let requestSensorStatus = getRequestBody(`/iolinkmaster/port[${iolinkport}]/iolinkdevice/status/getdata`);
        let requestSensorData = getRequestBody(`/iolinkmaster/port[${iolinkport}]/iolinkdevice/pdin/getdata`);


        let comSpeed = '';
        switch (await getValue(endpoint, requestSensorComSpeed)) {
            case 0:
                comSpeed = 'COM1 (4.8 kBaud)';
                break;
            case 1:
                comSpeed = 'COM2 (38.4 kBaud)';
                break;
            case 2:
                comSpeed = 'COM3 (230.4 kBaud)';
                break;
        }
        let cycletime = await getValue(endpoint, requestSensorCycletime) / 1000;

        //TODO: Abbrechen wenn Port leer
        let vendorid = await getValue(endpoint, requestSensorVendorId);
        let sensorid = await getValue(endpoint, requestSensorId);
        let sensorName = await getValue(endpoint, requestSensorName);
        let serialnumber = await getValue(endpoint, requestDeviceSn);
        let deviceStatus = '';
        switch (await getValue(endpoint, requestSensorStatus)) {
            case 0:
                deviceStatus = 'Not connected';
                break;
            case 1:
                deviceStatus = 'Preoperate';
                break;
            case 2:
                deviceStatus = 'Operate';
                break;
            case 3:
                deviceStatus = 'Communication error';
                break;
        }
        let processdatain = await getValue(endpoint, requestSensorData);


        let idPort = `${portschannelpath}.${iolinkport}`
        let idIoLink = `${idPort}.iolink`;
        let idDevice = `${idPort}.${sensorName}`;
        let idProcessDataIn = `${idDevice}.processdatain`;
        let idInfo = `${idDevice}.info`;


        //Prepare state tree
        generateChannelObject(idPort, `IO-Link Port ${iolinkport}`);
        generateChannelObject(idIoLink, 'IO-Link');
        generateDeviceObject(idDevice, sensorName);
        generateChannelObject(idProcessDataIn, 'Processdata In');
        generateChannelObject(idInfo, `Info`);

        //Write states
        generateStateObject(`${idIoLink}.comspeed`, 'Communication Mode', 'value', 'string', comSpeed);
        generateStateObject(`${idIoLink}.mastercycletime`, 'Master Cycletime', 'value.interval', 'number', cycletime);

        generateStateObject(`${idInfo}.status`, 'Device status', 'info.status', 'string', deviceStatus);
        generateStateObject(`${idInfo}.vendorid`, 'Vendor ID', 'value', 'string', vendorid);
        generateStateObject(`${idInfo}.sensorid`, 'Sensor ID', 'value', 'string', sensorid);
        generateStateObject(`${idInfo}.serialnumber`, 'Serial number', 'value', 'string', serialnumber);

        generateStateObject(`${idProcessDataIn}.raw`, 'PDI', 'value', 'string', processdatain);

        if (devicespec != null) {
            try {
                adapter.log.info(devicespec.deviceSpecName + ' loaded');

                devicespec.processDataIn.forEach((/** @type {{ name: string; minValue: number; maxValue: number; bitOffset: number; bitWidth: number; encoding: string; stateConfiguration: { name: string; unit: string; type: string; role: string; scalingFactor: number; scalingOffset: number; generateValue: boolean; generateStatus: boolean; generateChannel: boolean; }; states: any[]; }} */ pdi) => {

                    let sc = pdi.stateConfiguration;
                    let baseId = `${idProcessDataIn}.${getIdString(sc.name)}`;

                    let state = 'OK'; //TODO: parse state as string
                    let value = 'NaN'; //TODO: parse value as target type

                    if (sc.generateChannel || sc.generateStatus || sc.generateValue) {
                        if (sc.generateChannel == true) {
                            generateChannelObject(baseId, sc.name);
                            if (sc.generateStatus) {
                                generateStateObject(`${baseId}.status`, 'Status', 'info.status', 'string', state);
                            }
                            if (sc.generateValue) {
                                //value must fit target type!
                                generateStateObject(`${baseId}.value`, 'Value', sc.role, sc.type, value, sc.unit);
                            }
                        } else { //without channel
                            if (sc.generateStatus) {
                                generateStateObject(`${baseId}_status`, `${sc.name} Status`, 'info.status', 'string', state);
                            }
                            if (sc.generateValue) {
                                //value must fit target type!
                                generateStateObject(`${baseId}`, sc.name, sc.role, sc.type, value, sc.unit);
                            }
                        }
                    } else {
                        //ERROR
                        adapter.log.info('IO-Link adapter: No states are generated!');
                    }

                });
            } catch (error) {
                adapter.log.warn('1 IO-Link adapter - ERROR: ' + error);
            }
        } else {
            adapter.log.warn('no devicespec?: ' + devicespec);
        }

    } catch (error) {
        adapter.log.info('2 IO-Link adapter - ERROR: ' + error);
        adapter.log.error(error);
        adapter.stop();
    }
}

// function for fetching data
const getData = async (endpoint, iolinkport) => {
    try {
        try { //sensor info and process data requests
            let requestSensorName = getRequestBody(`/iolinkmaster/port[${iolinkport}]/iolinkdevice/productname/getdata`);

            //master info and process data requests
            let requestMasterName = getRequestBody(`/deviceinfo/productcode/getdata`);


            let masterDeviceName = await getValue(endpoint, requestMasterName);

            let availablPorts = 0;
            switch (masterDeviceName) {
                case 'AL1370':
                    availablPorts = 4;
                    break;
                case 'AL1352':
                    availablPorts = 8;
                    break;
                default:
                    adapter.log.error(`IO-Link adapter - Master ${masterDeviceName} is not supported!`);
                    adapter.stop();
                    break;
            }

            let sensorName = await getValue(endpoint, requestSensorName);
            //TODO: check sensor name

            adapter.setObjectNotExists(masterDeviceName, {
                type: 'device',
                common: {
                    name: `IFM ${masterDeviceName}`,
                    read: true,
                    write: false
                }
            });

            var idMasterProcessData = `${masterDeviceName}.processdata`;
            var idMasterInfo = `${masterDeviceName}.info`;

            adapter.setObjectNotExists(idMasterProcessData, {
                type: 'channel',
                common: {
                    name: `Process data (Master)`,
                    read: true,
                    write: false
                }
            });


            adapter.setObjectNotExists(idMasterInfo, {
                type: 'channel',
                common: {
                    name: `Info`,
                    read: true,
                    write: false
                }
            });

            adapter.setObjectNotExists(`${masterDeviceName}.${iolinkport}`, {
                type: 'channel',
                common: {
                    name: `IO-Link port ${iolinkport}`,
                    read: true,
                    write: false
                }
            });

            var idSensor = `${masterDeviceName}.${iolinkport}.${sensorName}`;

            const json = require('./devices/device-spec.json'); //(with path)
            var dummySpec = DeviceSpec.from(json);

            generateChannelObject(`${masterDeviceName}.iolinkports`, 'IO-Link Ports')
            await getPortData(endpoint, 1, `${masterDeviceName}.iolinkports`, null);
            await getPortData(endpoint, 2, `${masterDeviceName}.iolinkports`, dummySpec);
            //await getPortData(endpoint, 3, `${masterDeviceName}.iolinkports`);


            adapter.setObjectNotExists(idSensor, {
                type: 'device',
                common: {
                    name: `IFM ${sensorName}`,
                    read: true,
                    write: false
                }
            });

            var idProcessData = `${idSensor}.processdata`;

            adapter.log.info('Before sensor map');

            let tmpVorlauf = 0;
            let tmpRuecklauf = 0;
            let tmpDelta = 0;

            const sensorPortMap = new Map();
            for (let i = 1; i <= 4; i++) {
                let sensorPort = i;
                let requestSensorId = getRequestBody(`/iolinkmaster/port[${sensorPort}]/iolinkdevice/deviceid/getdata`);
                sensorPortMap.set(sensorPort, await getValue(endpoint, requestSensorId));
            }

            adapter.log.info('after sensor map');

            for (let [sensorPort, sensorId] of sensorPortMap) {
                adapter.log.info('Beginning calculate values ' + sensorPort);
                let bytes = await getValue(endpoint, getRequestBody(`/iolinkmaster/port[${sensorPort}]/iolinkdevice/pdin/getdata`));

                if (sensorId === 135) {//let out1Value = (bytes[7] & 0x01) === 0x01;
                    //let out2Value = (bytes[7] & 0x02) === 0x02;

                    //0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
                    //0 1 A 1 F F 0 0 0 0 C  F  F  F  0  0
                    let humiditySub = bytes.substring(0, 4);
                    let humidity = parseInt(humiditySub, 16);
                    humidity = humidity * 0.1;

                    let tempSub = bytes.substring(8, 12);
                    let temp = parseInt(tempSub, 16);
                    temp = temp * 0.1;

                    adapter.setObjectNotExists(`${idProcessData}.humidity135`, {
                        type: 'state',
                        common: {
                            name: 'Humidity135',
                            role: 'value.humidity135',
                            type: 'number',
                            value: humidity,
                            unit: '%',
                            read: true,
                            write: false
                        }
                    });
                    adapter.setState(`${idProcessData}.humidity135`, humidity, true);

                    adapter.setObjectNotExists(`${idProcessData}.temperature135`, {
                        type: 'state',
                        common: {
                            name: 'Temperature135',
                            role: 'value.temperature135',
                            type: 'number',
                            value: temp,
                            unit: '°C',
                            read: true,
                            write: false
                        }
                    });
                    adapter.setState(`${idProcessData}.temperature135`, temp, true);
                }
                //Port 2
                else if (sensorId === 6) {
                    let tempretureVorlauf = parseInt(bytes, 16);
                    tempretureVorlauf = tempretureVorlauf * 0.1;
                    tmpVorlauf = tempretureVorlauf;
                    adapter.setObjectNotExists(`${idProcessData}.TemperatureVorlauf`, {
                        type: 'state',
                        common: {
                            name: 'TemperatureVorlauf',
                            role: 'value.TemperatureVorlauf',
                            type: 'number',
                            value: tempretureVorlauf,
                            unit: '°C',
                            read: true,
                            write: false
                        }
                    });
                    adapter.setState(`${idProcessData}.TemperatureVorlauf`, tempretureVorlauf, true);
                }
                //Port 3
                else if (sensorId === 25) {
                    let wordZero = parseInt(bytes.substring(0, 4), 16);
                    let pressure = wordZero >> 2;

                    adapter.setObjectNotExists(`${idProcessData}.pressure`, {
                        type: 'state',
                        common: {
                            name: 'Druck',
                            role: 'value.pressure',
                            type: 'number',
                            value: pressure,
                            unit: '%',
                            read: true,
                            write: false
                        }
                    });
                    adapter.setState(`${idProcessData}.flow48`, pressure, true);
                }
                //Port 4
                else if (sensorId === 48) {

                    let flow = parseInt(bytes.substring(0, 4), 16);

                    let wordTwo = parseInt(bytes.substring(4, 8), 16);
                    let temperatureRuecklauf = wordTwo >> 2;
                    temperatureRuecklauf = temperatureRuecklauf * 0.1;
                    tmpRuecklauf = temperatureRuecklauf;

                    adapter.setObjectNotExists(`${idProcessData}.flow48`, {
                        type: 'state',
                        common: {
                            name: 'Flow48',
                            role: 'value.flow48',
                            type: 'number',
                            value: flow,
                            unit: '%',
                            read: true,
                            write: false
                        }
                    });
                    adapter.setState(`${idProcessData}.flow48`, flow, true);

                    adapter.setObjectNotExists(`${idProcessData}.temperatureRuecklauf`, {
                        type: 'state',
                        common: {
                            name: 'TemperatureRuecklauf',
                            role: 'value.temperatureRuecklauf',
                            type: 'number',
                            value: temperatureRuecklauf,
                            unit: '°C',
                            read: true,
                            write: false
                        }
                    });
                    adapter.setState(`${idProcessData}.temperatureRuecklauf`, temperatureRuecklauf, true);
                }
                adapter.log.info('end calculating ' + sensorPort);
            }

            adapter.log.info('after calculate for loop');

            tmpDelta = tmpRuecklauf - tmpVorlauf;

            adapter.setObjectNotExists(`${idProcessData}.temperatureDelta`, {
                type: 'state',
                common: {
                    name: 'TemperatureDelta',
                    role: 'value.temperatureDelta',
                    type: 'number',
                    value: tmpDelta,
                    unit: '°C',
                    read: true,
                    write: false
                }
            });
            adapter.setState(`${idProcessData}.temperatureDelta`, tmpDelta, true);
        } catch (error) {
            adapter.log.info('My fault ' + error);
            adapter.log.error(error);
        }
        //#################################################################################
        //IO-Link infos


        //###############################################################################
        //Master process data


        adapter.log.info('IO-Link adapter - fetching data completed');
        adapter.log.info('IO-Link adapter - shutting down until next scheduled call');
        adapter.stop();

    } catch (error) {
        adapter.log.info('3 IO-Link adapter - ERROR: ' + error);
        adapter.log.error(error);
        adapter.stop();
    }
}

const getValue = async (endpoint, request) => {
    var res = await axios({
        method: 'post',
        url: `http://${endpoint}`,
        data: request,
        headers: {'content-type': 'application/json'}
    });
    return res.data['data']['value'];
}

/**
 * @param {string} name
 */
function getIdString(name) {
    return name.replace(/[&\/\\#,+()$~%.'":*?<>{}\s]/g, '_').toLowerCase();
}

/**
 * @param {string} id
 * @param {string} name
 */
function generateChannelObject(id, name) {
    //TODO: manuell prüfen ob channel schon existiert?
    adapter.setObjectNotExists(id, {
        type: 'channel',
        common: {
            name: name,
            read: true,
            write: false
        }
    });
}

/**
 * @param {string} id
 * @param {any} name
 */
function generateDeviceObject(id, name) {
    //TODO: manuell prüfen ob device schon existiert?
    adapter.setObjectNotExists(id, {
        type: 'device',
        common: {
            name: name,
            read: true,
            write: false
        }
    });
}

/**
 * @param {string} id
 * @param {string} name
 * @param {string} role
 * @param {string} type
 * @param {string | number} value
 * @param {string} unit
 */
function generateStateObject(id, name, role, type, value, unit = '') {
    //TODO: manuell prüfen ob state schon existiert?
    adapter.setObjectNotExists(id, {
        type: 'state',
        common: {
            name: name,
            role: role,
            type: type,
            value: value,
            unit: unit,
            read: true,
            write: false
        }
    });
    adapter.setState(id, value, true);
}

/**
 * @param {string} adr
 */
function getRequestBody(adr) {
    return `{"code": "request", "cid": 1, "adr": "${adr}"}`;
}

// is called when adapter shuts down
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called when adapter starts
adapter.on('ready', function () {
    adapter.log.info('IO-Link adapter - started');

    const endpoint = adapter.config.ifmSmA1x5xIp;
    const iolinkport = adapter.config.ifmSmIoLinkPort;

    adapter.log.debug('IO-Link adapter - fetching data started');
    if (endpoint && iolinkport) {
        getData(endpoint, iolinkport);
    } else {
        adapter.log.error('IO-Link adapter - config incomplete!');
        adapter.stop();
    }
});


