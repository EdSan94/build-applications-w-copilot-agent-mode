import { Activity, Team, User, Workout } from '../models/index.js';

type RequestBody = Record<string, unknown>;

function isRequestBody(input: unknown): input is RequestBody {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function activityFocus(type: string | undefined) {
  if (!type) return undefined;
  if (['run', 'cycle', 'walk', 'cardio'].includes(type.toLowerCase())) return 'endurance';
  return type.trim().toLowerCase();
}

export async function listActivities() {
  return Activity.find().lean();
}

export async function createActivity(input: unknown) {
  if (!isRequestBody(input)) throw httpError(400, 'Activity details are required');
  const { userId, teamId, type, minutes } = input;
  if (!isObjectId(userId) || !isObjectId(teamId)) throw httpError(400, 'Valid userId and teamId are required');
  if (typeof type !== 'string' || !type.trim()) throw httpError(400, 'Activity type is required');
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 1) {
    throw httpError(400, 'Activity minutes must be a positive number');
  }

  const [user, team] = await Promise.all([User.findById(userId), Team.findById(teamId)]);
  if (!user || !team) throw httpError(404, 'The selected user or team does not exist');

  return Activity.create({
    user: user._id,
    team: team._id,
    type: type.trim(),
    minutes,
    points: minutes,
    occurredAt: new Date(),
  });
}

export async function listTeams() {
  return Team.find().lean();
}

export async function createTeam(input: unknown) {
  if (!isRequestBody(input)) throw httpError(400, 'Team details are required');
  const { name, mascot, members = [] } = input;
  if (typeof name !== 'string' || !name.trim()) throw httpError(400, 'Team name is required');
  if (typeof mascot !== 'string' || !mascot.trim()) throw httpError(400, 'Team mascot is required');
  if (!Array.isArray(members) || !members.every(isObjectId)) {
    throw httpError(400, 'Team members must be valid user IDs');
  }
  if (members.length > 0) {
    const existingMembers = await User.countDocuments({ _id: { $in: members } });
    if (existingMembers !== new Set(members).size) throw httpError(404, 'One or more team members do not exist');
  }

  return Team.create({ name: name.trim(), mascot: mascot.trim(), members });
}

export async function getLeaderboard() {
  const teams = await Team.aggregate<{ teamName: string; totalPoints: number }>([
    {
      $lookup: {
        from: Activity.collection.name,
        localField: '_id',
        foreignField: 'team',
        as: 'activities',
      },
    },
    {
      $project: {
        _id: 0,
        teamName: '$name',
        totalPoints: { $sum: '$activities.points' },
      },
    },
    { $sort: { totalPoints: -1, teamName: 1 } },
  ]);
  return teams.map((team, index) => ({ ...team, rank: index + 1 }));
}

export async function suggestWorkouts(userEmail: string) {
  const user = await User.findOne({ email: userEmail.trim().toLowerCase() }).lean();
  if (!user) throw httpError(404, 'No user found for that email address');

  const recentActivity = await Activity.findOne({ user: user._id }).sort({ occurredAt: -1 }).lean();
  const goalFocus = user.fitnessGoal?.trim().toLowerCase();
  const recentFocus = activityFocus(recentActivity?.type);
  const preferredFocus = goalFocus ?? recentFocus;
  if (!preferredFocus) return [];

  let workouts = await Workout.find({ focus: preferredFocus }).sort({ title: 1 }).lean();
  const matchedGoal = workouts.length > 0 && preferredFocus === goalFocus;
  if (workouts.length === 0 && recentFocus && recentFocus !== preferredFocus) {
    workouts = await Workout.find({ focus: recentFocus }).sort({ title: 1 }).lean();
  }

  const reason = matchedGoal
    ? `Recommended because it supports your ${preferredFocus} goal.`
    : `Recommended based on your recent ${recentActivity?.type ?? preferredFocus} activity.`;
  return workouts.map((workout) => ({ ...workout, reason }));
}

export { User };
