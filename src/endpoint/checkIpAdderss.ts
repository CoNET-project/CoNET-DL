import {readFile} from 'node:fs'
import { logger } from '../util/logger'

const startFilter = () => {
	return readFile('kk', (err, data) => {
		if (err) {
			return logger(`startFilter error!`)
		}
		const kk = data.toString()
		kk.split('\r\n')
		logger(kk)
	})
}

startFilter()