type LogFields = Record<string, unknown>;

function write(level: string, fieldsOrMsg: LogFields | string, maybeMsg?: string): void {
  const payload =
    typeof fieldsOrMsg === "string"
      ? { level, msg: fieldsOrMsg }
      : { level, ...fieldsOrMsg, msg: maybeMsg };
  console.log(JSON.stringify(payload));
}

export const logger = {
  info(fieldsOrMsg: LogFields | string, maybeMsg?: string): void {
    write("info", fieldsOrMsg, maybeMsg);
  },
  error(fieldsOrMsg: LogFields | string, maybeMsg?: string): void {
    write("error", fieldsOrMsg, maybeMsg);
  },
  warn(fieldsOrMsg: LogFields | string, maybeMsg?: string): void {
    write("warn", fieldsOrMsg, maybeMsg);
  },
  debug(fieldsOrMsg: LogFields | string, maybeMsg?: string): void {
    write("debug", fieldsOrMsg, maybeMsg);
  },
  child(): typeof logger {
    return logger;
  },
};
