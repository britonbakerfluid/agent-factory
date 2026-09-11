import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRadioSearch, youtubeInitialData } from '../server/radio-search';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function app(){const server=Fastify();registerRadioSearch(server,req=>req.headers.authorization==='test'?'owner':undefined);return server;}
it('requires authentication before fetching and rate limits repeat searches',async()=>{
 const server=app(),fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({title:'Song',author_name:'Artist'})));vi.stubGlobal('fetch',fetcher);
 expect((await server.inject('/api/radio/search?q=abcdefghijk')).statusCode).toBe(401);expect(fetcher).not.toHaveBeenCalled();
 const req={url:'/api/radio/search?q=abcdefghijk',headers:{authorization:'test'}};
 expect((await server.inject(req)).statusCode).toBe(200);
 expect((await server.inject(req)).statusCode).toBe(429);expect(fetcher).toHaveBeenCalledTimes(1);await server.close();
});
it('parses delimiters and braces inside JSON strings',()=>{
 const data={title:'a }); and \\" { title',videoRenderer:{videoId:'abcdefghijk'}};
 expect(youtubeInitialData(`var ytInitialData = ${JSON.stringify(data)}; more script`)).toEqual(data);
});
it('bounds response size and caches failures',async()=>{
 let time=1000;vi.spyOn(Date,'now').mockImplementation(()=>time);
 const server=app(),fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response('x'.repeat(2_000_001))));vi.stubGlobal('fetch',fetcher);
 const req={url:'/api/radio/search?q=music',headers:{authorization:'test'}};
 expect((await server.inject(req)).statusCode).toBe(502);time+=1500;
 expect((await server.inject(req)).statusCode).toBe(502);expect(fetcher).toHaveBeenCalledTimes(1);await server.close();
});
it('rejects oversized queries without fetching',async()=>{
 const server=app(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 expect((await server.inject({url:'/api/radio/search?q='+ 'a'.repeat(201),headers:{authorization:'test'}})).statusCode).toBe(400);
 expect(fetcher).not.toHaveBeenCalled();await server.close();
});
