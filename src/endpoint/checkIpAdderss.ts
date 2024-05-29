import {readFile} from 'node:fs'
import { logger } from '../util/logger'
import Colors from 'colors/safe'
const startFilter = () => {
	return readFile('kk', (err, data) => {
		if (err) {
			return logger(`startFilter error!`)
		}
		const kk = data.toString()
		const ll = kk.split('\r\n')
		logger(Colors.red(`IP address Length [${ll.length}]`))
		ll.forEach(n => {
			const ipaddress = n.split(' ')[0]
			logger(Colors.blue(`ipaddress [${ipaddress}]`))
		})
		
	})
}

startFilter()