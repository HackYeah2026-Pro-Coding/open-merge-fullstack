export type Log = (message: string) => void;

export const log: Log = (message) => console.log(message);
