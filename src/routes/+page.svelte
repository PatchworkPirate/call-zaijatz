<script lang="ts">
	import {
		type ConnectionState,
		RoomEvent,
		type LocalTrack,
		Room,
		type Participant,
		RemoteAudioTrack
	} from 'livekit-client';
	import { onMount } from 'svelte';
	import * as _ from 'lodash';
	import { CogIcon, UserIcon } from 'lucide-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { twMerge } from 'tailwind-merge';
	import Rabbit from '$lib/assets/rabbit.png';
	import { v4 } from 'uuid';

	let mediaDevices: MediaDeviceInfo[] | undefined = $state();
	let localTracks: LocalTrack[] | undefined = $state();

	let jwt: string | undefined = $state();

	const room = new Room();
	let roomState: ConnectionState = $state(room.state);
	let activeDevices = $state('');
	let remoteParticipants: Map<string, Participant> = new SvelteMap(room.remoteParticipants);
	let remoteAudioTracks: Map<string, RemoteAudioTrack> = new SvelteMap();
	$inspect(remoteParticipants);

	let settingsModal: HTMLDialogElement | undefined = $state();
	let logs: string[] = $state([]);

	let activeSpeakers: Participant[] = $state([]);

	room.on(RoomEvent.ConnectionStateChanged, (state) => (roomState = state));

	room.on(RoomEvent.ActiveDeviceChanged, () => {
		activeDevices =
			'audioinput: ' +
			room.getActiveDevice('audioinput') +
			' audiooutput: ' +
			room.getActiveDevice('audiooutput');
	});

	room.on(RoomEvent.ParticipantConnected, (participant) => {
		remoteParticipants.set(participant.identity, participant);
		logs.push('Remote Participant Connected: ' + participant.identity);
	});
	room.on(RoomEvent.ParticipantDisconnected, (participant) => {
		remoteParticipants.delete(participant.identity);
		logs.push('Remote Participant Disconnected: ' + participant.identity);
	});

	room.on(RoomEvent.TrackSubscribed, (track, pub, part) => {
		if (track instanceof RemoteAudioTrack) {
			remoteAudioTracks.set(pub.trackSid, track);
		}
	});

	room.on(RoomEvent.TrackUnsubscribed, (track, pub, part) => {
		remoteAudioTracks.delete(pub.trackSid);
	});

	room.on(RoomEvent.Connected, async () => {
		console.log('connected to room');

		if (!localTracks) {
			localTracks = await room.localParticipant.createTracks({ audio: true });
		}

		for (const track of localTracks) {
			await room.localParticipant.publishTrack(track);
		}

		activeDevices =
			'audioinput: ' +
			room.getActiveDevice('audioinput') +
			' audiooutput: ' +
			room.getActiveDevice('audiooutput');

		room.remoteParticipants.forEach((participant) => {
			remoteParticipants.set(participant.identity, participant);
		});
	});

	room.on(RoomEvent.Disconnected, () => {
		remoteAudioTracks.forEach((track) => {
			if (track.sid) {
				remoteAudioTracks.delete(track.sid);
			}
		});
		remoteParticipants.forEach((part) => remoteParticipants.delete(part.identity));
	});

	room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
		console.log('Track Subbed', track, publication, participant);
	});

	room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
		activeSpeakers = speakers;
	});

	onMount(() => {
		fetch('https://dev.webcomms.net/api/v1/rtc-access', {
			headers: {
				'Content-Type': 'application/json'
			},
			method: 'POST',
			body: JSON.stringify({
				identity: v4(),
				roomName: 'call-zaijatz'
			})
		}).then(async (response) => {
			const data = await response.json();
			jwt = data.jwt;

			console.log('jwt fetched');
		});

		navigator.mediaDevices.enumerateDevices().then((devices) => (mediaDevices = devices));
	});
</script>

{#if mediaDevices}
	<div class="flex h-svh w-full flex-col justify-between p-2">
		<button
			class="flex cursor-pointer flex-row justify-end"
			onclick={() => {
				if (settingsModal) {
					settingsModal.showModal();
				}
			}}><CogIcon /></button
		>
		<dialog id="settingsModal" bind:this={settingsModal} class="modal w-svw">
			<div class="modal-box m-0 h-full w-full">
				<div class="flex flex-col gap-1 overflow-y-auto">
					{#each logs as log}
						<p>{log}</p>
					{/each}
				</div>
				<div class="flex flex-col gap-1">
					<p>Current Status:</p>
					<p>Active Devices:</p>
					<p>{JSON.stringify(activeDevices)}</p>
					<p>Incoming Tracks:</p>
					<p>{JSON.stringify(Object.fromEntries(remoteAudioTracks.entries()))}</p>
				</div>
				<form method="dialog">
					<button class="btn">Close</button>
				</form>
			</div>
		</dialog>
		{#if roomState === 'disconnected'}
			<div class="flex flex-1 flex-col items-center justify-center">
				<img
					src={Rabbit}
					class="mx-auto flex max-h-64 max-w-64 flex-1 rounded-full"
					alt=""
					srcset=""
				/>
			</div>
			<button
				class="btn btn-primary"
				onclick={async () => {
					if (!jwt) {
						console.error('Invalid JWT', jwt);
						return;
					}
					await room.connect('wss://rtc.webcomms.net', jwt, { autoSubscribe: true });
				}}>Call</button
			>
		{:else if roomState === 'connected'}
			<div class="flex flex-1 flex-row flex-wrap items-center justify-evenly gap-4">
				{#if remoteParticipants.size > 0}
					{#each remoteParticipants.values() as participant}
						<div class="flex flex-col items-center">
							<UserIcon
								class={twMerge(
									'm-5 h-24 w-24 rounded-full border-2 border-slate-300 bg-slate-300 text-white transition-all',
									activeSpeakers.map((a) => a.identity).includes(participant.identity) &&
										'border-emerald-500'
								)}
							/>
							<sm class="max-w-24 overflow-clip text-center text-xs text-nowrap text-slate-300"
								>{participant.identity}</sm
							>
						</div>
					{/each}
				{:else}
					<p class="text-2xl text-slate-300 capitalize">Nobody here</p>
				{/if}
			</div>
			<audio
				{@attach (audio) => {
					remoteAudioTracks.values().forEach((trackPub) => {
						trackPub.attach(audio);
					});
				}}
			></audio>
			<button
				type="button"
				class="btn btn-error"
				onclick={async () => {
					await room.disconnect(true);
				}}>Disconnect</button
			>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center">
				<img
					src={Rabbit}
					class="mx-auto flex max-h-64 max-w-64 flex-1 rounded-full"
					alt=""
					srcset=""
				/>
			</div>
			<button class="btn btn-primary" disabled>{_.capitalize(roomState)}</button>
		{/if}
	</div>
{:else if !localTracks}
	<p>Allow Mic access</p>
{/if}
