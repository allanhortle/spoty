import winston from 'winston';
import path from 'path';
import {logPath} from './storage.js';

export default winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.errors({stack: true}), winston.format.json()),
    transports: [new winston.transports.File({filename: path.join(logPath, 'spoty.log')})]
});
