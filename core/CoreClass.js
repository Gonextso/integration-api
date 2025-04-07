import chalk from "chalk";
import LogHelper from "../helpers/LogHelper.js";

export default class Coreclass {
    throws = (message) => {
        throw new Error(message);
    }

    exit = (reason) => {
        console.log(chalk.white("Error:"), chalk.red(reason));

        process.exit(1);
    }

    logger = LogHelper
}