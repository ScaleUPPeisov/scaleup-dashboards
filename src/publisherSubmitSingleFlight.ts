/** Prevents duplicate async batch submissions before React busy state re-renders. */
export async function runSingleFlight<T>(lock:{current:boolean},action:()=>Promise<T>):Promise<T|undefined>{
  if(lock.current)return undefined;
  lock.current=true;
  try{return await action()}
  finally{lock.current=false}
}
