import winston from 'winston';
export default winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [new winston.transports.File({filename: 'combined.log'})]
});
