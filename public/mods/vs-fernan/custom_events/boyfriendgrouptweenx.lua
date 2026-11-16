function onEvent(name, value1, value2)
	if name == 'BoyfriendGroupTweenX' then
		doTweenX('boyfriendGroupMoveX', 'boyfriendGroup', value1, value2, 'SineInOut')
	end
end