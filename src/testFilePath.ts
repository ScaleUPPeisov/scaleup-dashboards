export function testFilePath(relative:string,base:string){
  const url=new URL(relative,base);
  let path=decodeURIComponent(url.pathname);
  if(/^\/[A-Za-z]:\//.test(path))path=path.slice(1);
  return path;
}
