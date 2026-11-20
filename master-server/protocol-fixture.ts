// An isolated gateway for protocol checks that need to control the only node.
import { startGateway } from './gateway'
import { PairingToken } from './pairing'

startGateway(Number(process.env.WS_PORT), { pairing: new PairingToken() })
