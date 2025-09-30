import type { PageServerLoad } from './$types';
import { AccessToken } from 'livekit-server-sdk';
import { PRIVATE_LIVEKIT_API_KEY, PRIVATE_LIVEKIT_API_SECRET } from '$env/static/private';
import { v4 } from 'uuid';

export const load = (async () => {
	const identity = v4();

	const access = new AccessToken(PRIVATE_LIVEKIT_API_KEY, PRIVATE_LIVEKIT_API_SECRET, { identity });

	access.addGrant({ roomJoin: true, room: 'call-zaijatz', canUpdateOwnMetadata: true });

	const jwt = await access.toJwt();

	return { jwt };
}) satisfies PageServerLoad;
