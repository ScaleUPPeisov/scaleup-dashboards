export type ErrorTaskLike={id:string;status:string;error?:string};
export type ErrorHistoryLike={id:string};
export function clearErrorPresentation<T extends ErrorTaskLike>(jobs:T[]){
 return jobs.map(j=>j.error?{...j,error:undefined}:j);
}
export function errorPresentationCount(jobs:ErrorTaskLike[],history:ErrorHistoryLike[]){
 return jobs.filter(j=>Boolean(j.error)).length+history.length;
}
export type BatchFailure={id:string;message:string;technicalDetail?:string};
export function batchFailureToast(failures:BatchFailure[]){
 if(!failures.length)return undefined;
 if(failures.length===1)return{title:'Операция не выполнена',message:failures[0].message};
 return{title:`Не удалось обработать ${failures.length} видео`,message:'Остальные задачи продолжены. Подробности сохранены в Error Center.'};
}
