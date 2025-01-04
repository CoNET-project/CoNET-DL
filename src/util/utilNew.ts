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

	const exit = () => {
		setTimeout(() => {
			resolve (true)
		}, 1000)
	}
	const req = HTTP_request (option, res => {
		clearTimeout(timeout)

		if (res.statusCode === 200) {
			logger(Colors.blue(`host [${host}] success!`))
			return exit()
		}

		logger(Colors.red(`host [${host}] response [${res.statusCode}] Error!`))
		return exit()
		
	})

	req.once('error', (e) => {
		logger(Colors.red(`host [${host}] response on Error! Error!`), e)
		return exit()
	})

	const timeout = setTimeout(() => {
		logger(Colors.red(`host ${host} Timeout Error!`))
		return exit()
	}, 10000)

	req.end()
})



