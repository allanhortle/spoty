import winston from 'winston';
import path from 'path';
import envPaths from 'env-paths';

const paths = envPaths('spoty');

export default winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.errors({stack: true}), winston.format.json()),
    transports: [new winston.transports.File({filename: path.join(paths.log, 'spoty.log')})]
});
