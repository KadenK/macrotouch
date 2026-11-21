import { definePlugin } from '../../plugin-sdk'
import keyCombo from './keyCombo'
import typeText from './typeText'

export default definePlugin({ actions: [keyCombo, typeText] })
