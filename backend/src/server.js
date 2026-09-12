import { buildApp } from "./app.js";
const app=await buildApp();const port=Number(process.env.PORT||10000);try{await app.listen({port,host:"0.0.0.0"});}catch(e){app.log.error(e);process.exit(1);}
