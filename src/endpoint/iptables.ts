// "use strict";
// Object.defineProperty(exports, "__esModule", { value: true });
// const help_database_1 = require("./help-database");
// const [, , ...args] = process.argv;
// const check = async () => {
//     console.log(await (0, help_database_1.checkIpAddress)(args[0]));
// };
// check();


import {checkIpAddress} from './help-database'
import {readFile} from 'node:fs'
import { logger } from '../util/logger'
import Colors from 'colors/safe'
import {exec} from 'node:child_process'



const startFilter = () => {
	return readFile('kk', (err, data) => {
		if (err) {
			return logger(`startFilter error!`)
		}
		const kk = data.toString()
		const ll = kk.split('\n')
		
		logger(Colors.red(`IP address Length [${ll.length}]`))
		ll.forEach(async n => {
			const ipaddress = n.split(' ')[0]
			const kk = await checkIpAddress(ipaddress)
			if (!kk||kk<1) {
				logger(Colors.blue(`${n}`))
			}
		})
		
	})
}

startFilter()