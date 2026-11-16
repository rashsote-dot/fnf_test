function onEvent(name, value1, value2)
	if name == 'DadGroupTweenY' then
		doTweenY('dadGroupMoveY', 'dadGroup', value1, value2, 'SineInOut')
	end
end