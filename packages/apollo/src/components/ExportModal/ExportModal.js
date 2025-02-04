/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
import { Checkbox } from 'carbon-components-react';
import PropTypes from 'prop-types';
import React from 'react';
import { withLocalize } from 'react-localize-redux';
import { connect } from 'react-redux';
import { showWarning, updateState } from '../../redux/commonActions';
import { CertificateAuthorityRestApi } from '../../rest/CertificateAuthorityRestApi';
import IdentityApi from '../../rest/IdentityApi';
import { MspRestApi } from '../../rest/MspRestApi';
import { NodeRestApi } from '../../rest/NodeRestApi';
import { OrdererRestApi } from '../../rest/OrdererRestApi';
import { PeerRestApi } from '../../rest/PeerRestApi';
import Helper from '../../utils/helper';
import ImportantBox from '../ImportantBox/ImportantBox';
import Logger from '../Log/Logger';
import Wizard from '../Wizard/Wizard';
import WizardStep from '../WizardStep/WizardStep';

const SCOPE = 'exportModal';
const Log = new Logger(SCOPE);

class ExportModal extends React.Component {
	componentDidMount() {
		this.props.updateState(SCOPE, {
			exportCA: true,
			exportOrderer: true,
			exportPeer: true,
			exportMsp: true,
			exportIdentity: false,
		});
	}

	async getMspList() {
		let list = [];
		if (this.props.exportMsp) {
			const msp_list = await MspRestApi.getMsps();
			list = [...msp_list];
		}
		return list;
	}

	async getPeerList() {
		const list = [];
		if (this.props.exportPeer) {
			const peer_list = await PeerRestApi.getPeers();
			for (let i = 0; i < peer_list.length; i++) {
				const peer = peer_list[i];
				const identity = await IdentityApi.getAssociatedIdentity(peer);
				list.push({
					...peer,
					associatedIdentityName: identity ? identity.name : '',
				});
			}
		}
		return list;
	}

	async getOrderers() {
		const list = [];
		const orderer_list = await OrdererRestApi.getOrderers();
		let warning_tls_certs = false;
		for (let i = 0; i < orderer_list.length; i++) {
			let orderer = orderer_list[i];
			if (orderer.raft) {
				for (let j = 0; j < orderer.raft.length; j++) {
					let node = orderer.raft[j];
					if (!node.client_tls_cert && node.location === 'ibm_saas') {
						try {
							const nodes = await NodeRestApi.getTLSSignedCertFromDeployer([node]);
							node.client_tls_cert = nodes[0].client_tls_cert;
							node.server_tls_cert = nodes[0].server_tls_cert;
						} catch (err) {
							warning_tls_certs = true;
						}
					}
				}
			} else {
				if (!orderer.client_tls_cert && orderer.location === 'ibm_saas') {
					try {
						const nodes = await NodeRestApi.getTLSSignedCertFromDeployer([orderer]);
						orderer.client_tls_cert = nodes[0].client_tls_cert;
						orderer.server_tls_cert = nodes[0].server_tls_cert;
					} catch (err) {
						warning_tls_certs = true;
					}
				}
			}
			list.push(orderer);
		}
		if (warning_tls_certs) {
			this.props.showWarning('warning_tls_certs');
		}
		return list;
	}

	async getOrdererList() {
		const list = [];
		if (this.props.exportOrderer) {
			const orderer_list = await this.getOrderers();
			for (let i = 0; i < orderer_list.length; i++) {
				let orderer = orderer_list[i];
				orderer.associatedIdentities = await IdentityApi.getAssociatedOrdererIdentities(orderer);
				let raft = undefined;
				if (orderer.raft) {
					raft = [];
					orderer.raft.forEach(raft_node => {
						raft.push({
							...raft_node,
						});
					});
				}
				list.push({
					...orderer,
					raft,
				});
			}
		}
		return list;
	}

	async getCAList() {
		const list = [];
		if (this.props.exportCA) {
			const ca_list = await CertificateAuthorityRestApi.getCAs();
			for (let i = 0; i < ca_list.length; i++) {
				const ca = ca_list[i];
				const identity = await IdentityApi.getAssociatedIdentity(ca);
				list.push({
					...ca,
					associatedIdentityName: identity ? identity.name : '',
				});
			}
		}
		return list;
	}

	async getIdentityList() {
		const list = [];
		if (this.props.exportIdentity) {
			const id_list = await IdentityApi.getIdentities();
			const list = [];
			id_list.forEach(id => {
				list.push({
					...id,
					type: 'identity',
				});
			});
		}
		return list;
	}

	async getExportList() {
		const identities = await this.getIdentityList();
		const cas = await this.getCAList();
		const orderers = await this.getOrdererList();
		const peers = await this.getPeerList();
		const msps = await this.getMspList();
		return [...identities, ...cas, ...orderers, ...peers, ...msps];
	}

	onSubmit = () => {
		Log.trace('onSubmit');
		return new Promise((resolve, reject) => {
			this.getExportList()
				.then(list => {
					const node = {
						name: 'data',
						raft: list,
					};
					Helper.exportNodesAsZip(node);
					resolve();
				})
				.catch(error => {
					reject(error);
				});
		});
	};

	render() {
		const translate = this.props.translate;
		return (
			<Wizard title="export"
				onClose={this.props.onClose}
				onSubmit={this.onSubmit}
				submitButtonLabel={translate('export')}
				submitButtonId="export_button"
			>
				<WizardStep type="WizardStep">
					<p className="ibp-export-modal-desc">{translate('export_modal_desc1')}</p>
					<p className="ibp-export-modal-desc">{translate('export_modal_desc2')}</p>
					<p className="ibp-export-modal-desc">{translate('export_modal_desc3')}</p>
					<div>
						<Checkbox
							id="export_ca_checkbox"
							labelText={translate('cas')}
							onChange={() => {
								this.props.updateState(SCOPE, {
									exportCA: !this.props.exportCA,
								});
							}}
							checked={this.props.exportCA}
						/>
					</div>
					<div>
						<Checkbox
							id="export_orderer_checkbox"
							labelText={translate('orderers')}
							onChange={() => {
								this.props.updateState(SCOPE, {
									exportOrderer: !this.props.exportOrderer,
								});
							}}
							checked={this.props.exportOrderer}
						/>
					</div>
					<div>
						<Checkbox
							id="export_peer_checkbox"
							labelText={translate('peers')}
							onChange={() => {
								this.props.updateState(SCOPE, {
									exportPeer: !this.props.exportPeer,
								});
							}}
							checked={this.props.exportPeer}
						/>
					</div>
					<div>
						<Checkbox
							id="export_msp_checkbox"
							labelText={translate('msps')}
							onChange={() => {
								this.props.updateState(SCOPE, {
									exportMsp: !this.props.exportMsp,
								});
							}}
							checked={this.props.exportMsp}
						/>
					</div>
					<div className="ibp-export-identity-section">
						<Checkbox
							id="export_id_checkbox"
							labelText={translate('identities')}
							onChange={() => {
								this.props.updateState(SCOPE, {
									exportIdentity: !this.props.exportIdentity,
								});
							}}
							checked={this.props.exportIdentity}
						/>
					</div>
					{this.props.exportIdentity && <ImportantBox text="export_identity_important" />}
				</WizardStep>
			</Wizard>
		);
	}
}

const dataProps = {
	exportCA: PropTypes.bool,
	exportOrderer: PropTypes.bool,
	exportPeer: PropTypes.bool,
	exportMsp: PropTypes.bool,
	exportIdentity: PropTypes.bool,
};

ExportModal.propTypes = {
	...dataProps,
	onComplete: PropTypes.func,
	onClose: PropTypes.func,
	showWarning: PropTypes.func,
	updateState: PropTypes.func,
	translate: PropTypes.func, // Provided by withLocalize
};

export default connect(
	state => {
		return Helper.mapStateToProps(state[SCOPE], dataProps);
	},
	{
		showWarning,
		updateState,
	}
)(withLocalize(ExportModal));
