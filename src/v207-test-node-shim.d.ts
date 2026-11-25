declare module 'node:fs' {
 export function readFileSync(path:string,encoding:'utf8'):string;
 export function readdirSync(path:string):string[];
 export function mkdirSync(path:string,options?:{recursive?:boolean}):string|undefined;
 export function writeFileSync(path:string,data:string):void;
}
declare module 'node:path' {
 export function join(...parts:string[]):string;
 export function resolve(...parts:string[]):string;
}
