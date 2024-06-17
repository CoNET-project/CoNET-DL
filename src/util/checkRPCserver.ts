import {readFile} from 'node:fs'
import {exec} from 'node:child_process'
import { logger } from './util'
import Colors from 'colors/safe'

const serverFIle = `cat /etc/nginx/sites-available/conet.conf|grep "[^#]server\ [^{]"`
const getAllServer = () => {
	exec(serverFIle, (err, stdout) => {
		logger(Colors.blue(`getAllServer ${stdout}`))
	})
}


getAllServer()