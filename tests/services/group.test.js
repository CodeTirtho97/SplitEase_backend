/**
 * Group service tests (T5)
 *
 * Tests the groupService functions directly against the in-memory MongoDB.
 * Redis is mocked via moduleNameMapper so socket events are no-ops.
 */

const User = require("../../models/User");
const Group = require("../../models/Group");
const {
  createGroup,
  editGroup,
  deleteGroup,
  viewGroupDetails,
} = require("../../services/groupService");

let creator, member1, member2;

beforeAll(async () => {
  // Create three users; creator has both members as friends
  creator = await User.create({
    fullName: "Creator User",
    email: "creator@test.com",
    gender: "Male",
    password: "hashed",
  });
  member1 = await User.create({
    fullName: "Member One",
    email: "member1@test.com",
    gender: "Female",
    password: "hashed",
  });
  member2 = await User.create({
    fullName: "Member Two",
    email: "member2@test.com",
    gender: "Other",
    password: "hashed",
  });

  // Manually add both members to the creator's friends list
  creator.friends = [member1._id, member2._id];
  await creator.save();
});

describe("createGroup", () => {
  test("creates a group with valid data", async () => {
    const result = await createGroup(creator._id.toString(), {
      name: "Trip Group",
      description: "Weekend trip",
      type: "Travel",
      members: [member1._id.toString(), member2._id.toString()],
    });

    expect(result.group).toBeDefined();
    expect(result.group.name).toBe("Trip Group");
    // Creator is always included
    expect(result.group.members.length).toBe(3);
  });

  test("rejects a group with an invalid type", async () => {
    await expect(
      createGroup(creator._id.toString(), {
        name: "Bad Type Group",
        type: "InvalidType",
        members: [member1._id.toString()],
      })
    ).rejects.toThrow("Invalid group type");
  });

  test("rejects when name is missing", async () => {
    await expect(
      createGroup(creator._id.toString(), {
        name: "",
        type: "Travel",
        members: [member1._id.toString()],
      })
    ).rejects.toThrow();
  });

  test("rejects when name exceeds 30 characters", async () => {
    await expect(
      createGroup(creator._id.toString(), {
        name: "A".repeat(31),
        type: "Travel",
        members: [member1._id.toString()],
      })
    ).rejects.toThrow("30 characters");
  });

  test("rejects a member who is not in creator's friend list", async () => {
    const stranger = await User.create({
      fullName: "Stranger",
      email: "stranger@test.com",
      gender: "Male",
      password: "hashed",
    });

    await expect(
      createGroup(creator._id.toString(), {
        name: "Stranger Group",
        type: "Friends",
        members: [stranger._id.toString()],
      })
    ).rejects.toThrow("not in your friends list");
  });

  test("rejects duplicate group (same name and members)", async () => {
    // First creation should succeed (already created above)
    // Second attempt with the same name + members should fail
    await expect(
      createGroup(creator._id.toString(), {
        name: "Trip Group",
        description: "Duplicate",
        type: "Travel",
        members: [member1._id.toString(), member2._id.toString()],
      })
    ).rejects.toThrow("already exists");
  });
});

describe("editGroup", () => {
  let group;

  beforeAll(async () => {
    group = await Group.create({
      name: "Editable Group",
      description: "Original desc",
      type: "Work",
      members: [creator._id, member1._id],
      createdBy: creator._id,
    });
  });

  test("updates only the provided fields", async () => {
    const result = await editGroup(
      group._id.toString(),
      creator._id.toString(),
      { description: "Updated desc" }
    );

    expect(result.updatedGroup.description).toBe("Updated desc");
    expect(result.updatedGroup.name).toBe("Editable Group"); // unchanged
  });

  test("rejects edit by a non-creator", async () => {
    await expect(
      editGroup(group._id.toString(), member1._id.toString(), {
        description: "Hack",
      })
    ).rejects.toThrow();
  });
});

describe("deleteGroup", () => {
  test("deletes group when called by creator", async () => {
    const group = await Group.create({
      name: "Delete Me",
      type: "Event",
      members: [creator._id],
      createdBy: creator._id,
    });

    await deleteGroup(group._id.toString(), creator._id.toString());

    const found = await Group.findById(group._id);
    expect(found).toBeNull();
  });

  test("rejects deletion by non-creator", async () => {
    const group = await Group.create({
      name: "Protected Group",
      type: "Event",
      members: [creator._id, member1._id],
      createdBy: creator._id,
    });

    await expect(
      deleteGroup(group._id.toString(), member1._id.toString())
    ).rejects.toThrow();
  });
});

describe("viewGroupDetails", () => {
  test("returns group info including expenses and transactions", async () => {
    const group = await Group.create({
      name: "View Group",
      type: "Friends",
      members: [creator._id, member1._id],
      createdBy: creator._id,
    });

    const result = await viewGroupDetails(group._id.toString());
    expect(result.group).toBeDefined();
    expect(result.group.name).toBe("View Group");
    expect(Array.isArray(result.expenses)).toBe(true);
    expect(Array.isArray(result.pendingTransactions)).toBe(true);
    expect(Array.isArray(result.completedTransactions)).toBe(true);
  });

  test("rejects non-existent group", async () => {
    const { Types } = require("mongoose");
    const fakeId = new Types.ObjectId().toString();
    await expect(viewGroupDetails(fakeId)).rejects.toThrow(/not found/i);
  });
});
