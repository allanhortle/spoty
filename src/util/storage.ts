import envPaths from 'env-paths';
import mkdir from 'make-dir';

const paths = envPaths('spoty');

export const logPath = paths.log;

export async function initializeStorage() {
    await mkdir(paths.data);
    await mkdir(paths.log);
}
