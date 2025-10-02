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

	let localTracks: LocalTrack[] | undefined = $state();

	let jwt: string | undefined = $state();

	const room = new Room();
	let roomState: ConnectionState = $state(room.state);
	let activeDevices = $state('');

	let remoteParticipants: Array<
		{ id: string; audioTracks: string[]; videoTracks: string[] }
	> = $state([]);
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
		remoteParticipants.push( {
			id: participant.identity,
			audioTracks: [],
			videoTracks: []
		});
		logs.push('Remote Participant Connected: ' + participant.identity);
	});

	room.on(RoomEvent.ParticipantDisconnected, (participant) => {
		const partIndex = remoteParticipants.findIndex(p => p.id === participant.identity)

		if (partIndex === -1) return

		remoteParticipants.splice(partIndex, 1)
		logs.push('Remote Participant Disconnected: ' + participant.identity);
	});

	room.on(RoomEvent.TrackSubscribed, (track, pub, part) => {

		const participant = remoteParticipants.find(p => p.id === part.identity);
		if (!participant) return;

		participant.audioTracks.push(pub.trackSid);
	});

	room.on(RoomEvent.TrackUnsubscribed, (track, pub, part) => {
		if (track instanceof RemoteAudioTrack) {
			const participant = remoteParticipants.find(p => p.id === part.identity);

			if (!participant) return;

			const trackIndex = participant.audioTracks.findIndex((tr) => tr === pub.trackSid);

			if (trackIndex === -1) return;

			participant.audioTracks.splice(trackIndex, 1);
		}
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
			remoteParticipants.push({
				id: participant.identity,
				audioTracks: Array.from(participant.audioTrackPublications.values()).map(pub => (pub.trackSid)),
				videoTracks: []
			});
		});
	});

	room.on(RoomEvent.Disconnected, () => {
		remoteParticipants.forEach((part, index) => {
			remoteParticipants.splice(index, 1);
		});
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

		room.localParticipant.createTracks({ audio: true }).then((tracks) => (localTracks = tracks));
	});
</script>

{#if localTracks}
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
					<p>{JSON.stringify(Object.fromEntries(remoteParticipants.entries()))}</p>
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
				{#if remoteParticipants.length > 0}
					{#each remoteParticipants as participant}
						{@const roomParticipant = room.remoteParticipants.get(participant.id)}
						{#if roomParticipant}
							<div class="flex flex-col items-center">
								<UserIcon
									class={twMerge(
										'm-5 h-24 w-24 rounded-full border-2 border-slate-300 bg-slate-300 text-white transition-all',
										activeSpeakers.map((a) => a.identity).includes(roomParticipant.identity) &&
											'border-emerald-500'
									)}
								/>
								<sm class="max-w-24 overflow-clip text-center text-xs text-nowrap text-slate-300"
									>{roomParticipant.identity}</sm
								>
								<audio
									{@attach (audio) => {
										participant.audioTracks.forEach((trackSid) => {
											const trackPublication = roomParticipant.audioTrackPublications.get(trackSid)
											if (!trackPublication || !trackPublication.audioTrack) return;

											trackPublication.audioTrack.attach(audio)
										});
									}}
								></audio>
							</div>
						{/if}
					{/each}
				{:else}
					<p class="text-2xl text-slate-300 capitalize">Nobody here</p>
				{/if}
			</div>

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
