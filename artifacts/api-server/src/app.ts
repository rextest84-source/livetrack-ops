import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        level: "info",
        method: req.method,
        url: req.url?.split("?")[0],
        status: res.statusCode,
        ms: Date.now() - start,
      }),
    );
  });
  next();
});
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
