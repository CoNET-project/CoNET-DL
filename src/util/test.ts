import {sendGuardianNodesContract, masterSetup, checkTx, getNetworkName, logger, checkReferralsV2_OnCONET_Holesky, returnGuardianPlanReferral, CONET_guardian_purchase_Receiving_Address, checkSign, getAssetERC20Address, checkErc20Tx} from './util'
import {inspect} from 'node:util'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
import assetOracle_ABI from '../endpoint/oracleAsset.ABI.json'



const ub = {"walletAddress":"0x55d39f7397f2c1f5fadb3829f5cdb8accc107799","data":{"receiptTx":"0x2655402b98013fae72d5eca37bbdd7fbc3ff662afc9bb48b990444cebef582e7","publishKeys":["0xa1A1F55591a3716f126571b9643d084731909DF6"],"nodes":1,"tokenName":"wusdt","network":"BSC","amount":"1250000000000000000000"}}


