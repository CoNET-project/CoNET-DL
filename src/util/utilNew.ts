import type { RequestOptions, ServerResponse } from 'node:http'
import {request as HTTP_request} from 'node:http'
import { logger } from './logger'
import Colors from 'colors/safe'

export const tryConnect = async (host: string) => new Promise(resolve => {
	
	const option: RequestOptions = {
		host: host,
		path: '/',
		port: 80,
		method: 'GET',
		protocol: 'http:'
	}

	const req = HTTP_request (option, res => {
		clearTimeout(timeout)

		if (res.statusCode === 200) {
			logger(Colors.blue(`host [${host}] success!`))
			return resolve (true)
		}
		logger(Colors.red(`host [${host}] response [${res.statusCode}] Error!`))
		return resolve(false)
		
	})

	req.once('error', (e) => {
		logger(Colors.red(`host [${host}] response on Error! Error!`), e)
		resolve(false)
	})

	const timeout = setTimeout(() => {
		logger(Colors.red(`host ${host} Timeout Error!`))
	}, 1000)

	req.end()
})