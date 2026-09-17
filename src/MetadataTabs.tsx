import React,{useState} from 'react';
import {MetadataPage} from './MetadataPage';
import {ShortsMetadata} from './ShortsMetadata';
export function MetadataTabs(){const [tab,setTab]=useState<'video'|'shorts'>('video');return <><div className="youtubeTabs metadataTypeTabs"><button className={tab==='video'?'active':''} onClick={()=>setTab('video')}>VIDEO</button><button className={tab==='shorts'?'active':''} onClick={()=>setTab('shorts')}>SHORTS</button></div>{tab==='video'?<MetadataPage/>:<ShortsMetadata/>}</>}
