package reengineering.ddd.teamai.description;

import reengineering.ddd.archtype.Ref;

public record MemberDescription(Ref<String> user, String role) {}
