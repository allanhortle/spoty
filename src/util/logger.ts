import winston from 'winston';
import path from 'path';
import {logPath} from './storage';

export default winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [new winston.transports.File({filename: path.join(logPath, 'spoty.log')})]
});
